import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Once either rider blocks the other, neither sees what the other made —
 * posts, comments, reviews, routes, rides, profile, search, mentions — and
 * neither can follow, like, comment on, or join a ride led by the other.
 * Blocking ends any follow between them. A third rider sees both as before.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database (see
 * migrations.integration.test.ts for a container recipe).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
if (CONNECTION) {
  // The services read the app pool's URL at import time.
  process.env.DATABASE_URL = CONNECTION;
}

const db = CONNECTION ? await import("../../config/db.js") : null;
const community = CONNECTION ? await import("../../services/community.service.js") : null;
const notifications = CONNECTION ? await import("../../services/notifications.service.js") : null;
const mentions = CONNECTION ? await import("../../services/mention.service.js") : null;
const riders = CONNECTION ? await import("../../services/rider.service.js") : null;
const blocks = CONNECTION ? await import("../../services/blocks.js") : null;
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;
const join = CONNECTION ? await import("../../services/ride-join.service.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const ASHA = "a1a1a1a1-0000-0000-0000-0000000000c1"; // blocks Bala
const BALA = "b2b2b2b2-0000-0000-0000-0000000000c2";
const CHITRA = "c3c3c3c3-0000-0000-0000-0000000000c3"; // blocks nobody
const RIDERS = [ASHA, BALA, CHITRA];

const LINE = `{"type":"LineString","coordinates":[[77.6,12.9],[77.7,13.0]]}`;

const ids = (rows: Array<{ id: string }>): string[] => rows.map((row) => row.id);

test("a block hides each rider from the other everywhere", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at) VALUES
       ($1, 'blk-asha@example.test', 'Asha', 'blkasha', NULL),
       ($2, 'blk-bala@example.test', 'Bala', 'blkbala', NULL),
       ($3, 'blk-chitra@example.test', 'Chitra', 'blkchitra', NULL)
     ON CONFLICT (id) DO UPDATE SET deleted_at = NULL`,
    RIDERS,
  );
  // Start each run from a clean slate for these riders.
  await admin.query(`DELETE FROM blocked_riders WHERE blocker_id = ANY($1) OR blocked_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM follows WHERE follower_id = ANY($1) OR following_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM posts WHERE rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1)`, [RIDERS]);

  const post = async (riderId: string, content: string): Promise<string> =>
    (await admin.query(`INSERT INTO posts (rider_id, content) VALUES ($1, $2) RETURNING id`, [riderId, content]))
      .rows[0].id as string;

  const ashaPost = await post(ASHA, "Asha's post");
  const balaPost = await post(BALA, "Bala's post");
  const balaComment = (
    await admin.query(
      `INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'Bala on Asha''s post') RETURNING id`,
      [ashaPost, BALA],
    )
  ).rows[0].id as string;
  await admin.query(`INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'Chitra on Asha''s post')`, [
    ashaPost,
    CHITRA,
  ]);

  // Asha and Bala follow each other; Chitra follows both.
  await admin.query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2), ($2, $1), ($3, $1), ($3, $2)`,
    [ASHA, BALA, CHITRA],
  );

  // Bala leads an upcoming public ride, and made a public route.
  const balaRide = (
    await admin.query(
      `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
       VALUES ($1, 'Bala''s ride', 'scheduled', 'public', now() + interval '2 days') RETURNING id`,
      [BALA],
    )
  ).rows[0].id as string;
  const balaRoute = (
    await admin.query(
      `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name)
       VALUES ($1, 'Bala''s route', $2, 'public', 'Bengaluru', 'Nandi Hills') RETURNING id`,
      [BALA, LINE],
    )
  ).rows[0].id as string;

  // Chitra led a finished ride; Bala and Asha both reviewed it.
  const chitraRide = (
    await admin.query(
      `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
       VALUES ($1, 'Chitra''s ride', 'completed', 'public', now() - interval '2 days') RETURNING id`,
      [CHITRA],
    )
  ).rows[0].id as string;
  await admin.query(
    `INSERT INTO ride_reviews (ride_id, rider_id, rating, review_text) VALUES ($1, $2, 5, 'Bala liked it'), ($1, $3, 4, 'Asha liked it')`,
    [chitraRide, BALA, ASHA],
  );

  // ── Asha blocks Bala.
  assert.equal(await notifications!.blockRider(ASHA, BALA), true);

  await t.test("blocking ends the follows between them, and only those", async () => {
    const follows = await admin.query(
      `SELECT follower_id, following_id FROM follows WHERE follower_id = ANY($1) ORDER BY 1, 2`,
      [RIDERS],
    );
    const pairs = follows.rows.map((row) => `${row.follower_id}>${row.following_id}`);
    assert.deepEqual(pairs.sort(), [`${CHITRA}>${ASHA}`, `${CHITRA}>${BALA}`].sort());
  });

  await t.test("the block works both ways", async () => {
    assert.equal(await blocks!.isBlockedBetween(ASHA, BALA), true);
    assert.equal(await blocks!.isBlockedBetween(BALA, ASHA), true);
    assert.equal(await blocks!.isBlockedBetween(ASHA, CHITRA), false);
  });

  await t.test("the blocked list names who was blocked", async () => {
    const list = await notifications!.getBlockedRiders(ASHA);
    assert.equal(list.length, 1);
    assert.equal(list[0].blocked_id, BALA);
    assert.equal(list[0].blocked_name, "Bala");
  });

  await t.test("neither sees the other's posts; a third rider sees both", async () => {
    const forAsha = ids(await community!.getFeed(200, 0, ASHA));
    const forBala = ids(await community!.getFeed(200, 0, BALA));
    const forChitra = ids(await community!.getFeed(200, 0, CHITRA));

    assert.ok(forAsha.includes(ashaPost) && !forAsha.includes(balaPost));
    assert.ok(forBala.includes(balaPost) && !forBala.includes(ashaPost));
    assert.ok(forChitra.includes(ashaPost) && forChitra.includes(balaPost));

    assert.equal(await community!.getPostById(balaPost, ASHA), null);
    assert.equal(await community!.getPostById(ashaPost, BALA), null);
    assert.notEqual(await community!.getPostById(balaPost, CHITRA), null);
  });

  await t.test("comments by the other rider are hidden, and so is the other's thread", async () => {
    const forAsha = await community!.getComments(ashaPost, ASHA);
    assert.deepEqual(forAsha.map((c: { content: string }) => c.content), ["Chitra on Asha's post"]);

    assert.deepEqual(await community!.getComments(ashaPost, BALA), [], "Asha's post is hidden from Bala");
    assert.equal((await community!.getComments(ashaPost, CHITRA)).length, 2);

    assert.equal(await community!.getCommentById(balaComment, ASHA), null);
    assert.notEqual(await community!.getCommentById(balaComment, CHITRA), null);
  });

  await t.test("neither can like, comment on or follow the other", async () => {
    await assert.rejects(community!.likePost(balaPost, ASHA), /Post not found/);
    await assert.rejects(community!.likePost(ashaPost, BALA), /Post not found/);
    await assert.rejects(community!.addComment(ashaPost, BALA, { content: "hi" }), /Post not found/);
    await assert.rejects(community!.followRider(BALA, ASHA), /Rider not found/);
    await assert.rejects(community!.followRider(ASHA, BALA), /Rider not found/);

    assert.equal(await community!.likePost(balaPost, CHITRA), true);
  });

  await t.test("follower lists leave out the other rider", async () => {
    const chitraFollowsForAsha = (await community!.getFollowing(CHITRA, ASHA)).map((r: { id: string }) => r.id);
    const chitraFollowsForChitra = (await community!.getFollowing(CHITRA, CHITRA)).map((r: { id: string }) => r.id);
    assert.deepEqual(chitraFollowsForAsha, [ASHA]);
    assert.deepEqual(chitraFollowsForChitra.sort(), [ASHA, BALA].sort());
  });

  await t.test("mentions of the other rider notify nobody, and search leaves them out", async () => {
    assert.deepEqual(await mentions!.resolveMentionedRiders(["blkbala"], ASHA), []);
    assert.deepEqual(await mentions!.resolveMentionedRiders(["blkasha"], BALA), []);
    assert.equal((await mentions!.resolveMentionedRiders(["blkbala"], CHITRA)).length, 1);

    assert.deepEqual(await riders!.searchMentionSuggestions(ASHA, "blkbala"), []);
    assert.equal((await riders!.searchMentionSuggestions(CHITRA, "blkbala")).length, 1);
  });

  await t.test("reviews by the other rider are hidden", async () => {
    const forAsha = await community!.getRideReviews(chitraRide, ASHA);
    assert.deepEqual(forAsha.map((r: { rider_id: string }) => r.rider_id), [ASHA]);
    assert.equal((await community!.getRideReviews(chitraRide, CHITRA)).length, 2);
  });

  await t.test("the other rider's rides can't be found or joined", async () => {
    const discoverable = (await rides!.listDiscoverableRides(ASHA)).map((r) => String(r.id));
    assert.equal(discoverable.includes(balaRide), false);
    assert.equal(await rides!.getRideById(balaRide, ASHA), null);
    await assert.rejects(join!.joinOrRequestRide(balaRide, ASHA), /Ride not found/);

    assert.ok((await rides!.listDiscoverableRides(CHITRA)).some((r) => String(r.id) === balaRide));
    assert.equal(await join!.joinOrRequestRide(balaRide, CHITRA), "joined");
  });

  await t.test("the other rider's routes can't be found or opened", async () => {
    assert.equal(ids(await routes!.listVisibleRoutes(ASHA)).includes(balaRoute), false);
    assert.equal(await routes!.getRouteById(balaRoute, ASHA), null);
    assert.ok(ids(await routes!.listVisibleRoutes(CHITRA)).includes(balaRoute));
    assert.notEqual(await routes!.getRouteById(balaRoute, CHITRA), null);
    // Bala still sees his own route.
    assert.notEqual(await routes!.getRouteById(balaRoute, BALA), null);
  });

  await t.test("unblocking shows everything again, but doesn't restore follows", async () => {
    assert.equal(await notifications!.unblockRider(ASHA, BALA), true);

    assert.ok(ids(await community!.getFeed(200, 0, ASHA)).includes(balaPost));
    assert.notEqual(await routes!.getRouteById(balaRoute, ASHA), null);
    const asha = await admin.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`, [ASHA, BALA]);
    assert.equal(asha.rows.length, 0);
  });
});
