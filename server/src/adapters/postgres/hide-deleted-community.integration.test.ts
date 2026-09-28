import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * From the moment a rider deletes their account, nobody else sees their
 * community content — posts, comments, likes, follows — even though the rows
 * stay until the purge 30 days later. Nobody can like, comment on or follow
 * what is hidden either.
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
const riders = CONNECTION ? await import("../../services/rider.service.js") : null;

const GONE = "d1d1d1d1-0000-0000-0000-0000000000a1";
const ASHA = "e2e2e2e2-0000-0000-0000-0000000000a2";
const BALA = "f3f3f3f3-0000-0000-0000-0000000000a3";

test("a deleted rider's community content is hidden at once", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at) VALUES
       ($1, NULL, 'Deleted rider', NULL, now()),
       ($2, 'hide-asha@example.test', 'Asha', 'hideasha', NULL),
       ($3, 'hide-bala@example.test', 'Bala', 'hidebala', NULL)
     ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
    [GONE, ASHA, BALA],
  );
  // Start each run from a clean slate for these three riders.
  await admin.query(`DELETE FROM posts WHERE rider_id IN ($1, $2, $3)`, [GONE, ASHA, BALA]);
  await admin.query(
    `DELETE FROM follows WHERE follower_id IN ($1, $2, $3) OR following_id IN ($1, $2, $3)`,
    [GONE, ASHA, BALA],
  );

  const post = async (riderId: string, content: string): Promise<string> =>
    (await admin.query(`INSERT INTO posts (rider_id, content) VALUES ($1, $2) RETURNING id`, [riderId, content]))
      .rows[0].id as string;

  const gonePost = await post(GONE, "the deleted rider's post");
  const ashaPost = await post(ASHA, "Asha's post");

  // Both the deleted rider and Bala liked and commented on Asha's post; the
  // stored counts include both, as the app would have left them.
  await admin.query(`INSERT INTO likes (post_id, rider_id) VALUES ($1, $2), ($1, $3)`, [ashaPost, GONE, BALA]);
  await admin.query(
    `INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'from the deleted rider'), ($1, $3, 'from Bala')`,
    [ashaPost, GONE, BALA],
  );
  await admin.query(`UPDATE posts SET like_count = 2, comment_count = 2 WHERE id = $1`, [ashaPost]);
  // Bala commented on the deleted rider's post too.
  await admin.query(`INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'on a hidden post')`, [gonePost, BALA]);

  // The deleted rider followed Asha, Asha followed them back, Bala follows Asha.
  await admin.query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2), ($2, $1), ($3, $2)`,
    [GONE, ASHA, BALA],
  );

  await t.test("the feed leaves out the deleted rider's posts", async () => {
    const feed = await community!.getFeed(200, 0);
    const ids = feed.map((row: { id: string }) => row.id);
    assert.equal(ids.includes(gonePost), false);
    assert.equal(ids.includes(ashaPost), true);
  });

  await t.test("the deleted rider's post cannot be opened", async () => {
    assert.equal(await community!.getPostById(gonePost), null);
  });

  await t.test("counts on other posts leave out the deleted rider's like and comment", async () => {
    const opened = await community!.getPostById(ashaPost);
    assert.equal(Number(opened.like_count), 1);
    assert.equal(Number(opened.comment_count), 1);

    const inFeed = (await community!.getFeed(200, 0)).find((row: { id: string }) => row.id === ashaPost);
    assert.equal(Number(inFeed.like_count), 1);
    assert.equal(Number(inFeed.comment_count), 1);
  });

  await t.test("comments leave out the deleted rider, and a hidden post has none to show", async () => {
    const comments = await community!.getComments(ashaPost);
    assert.deepEqual(
      comments.map((row: { rider_id: string }) => row.rider_id),
      [BALA],
    );
    assert.deepEqual(await community!.getComments(gonePost), []);
  });

  await t.test("follower and following lists leave out the deleted rider", async () => {
    const followers = await community!.getFollowers(ASHA);
    assert.deepEqual(followers.map((row: { id: string }) => row.id), [BALA]);
    assert.deepEqual(await community!.getFollowing(ASHA), []);
  });

  await t.test("profile follow counts leave out the deleted rider", async () => {
    const profile = await riders!.getById(ASHA);
    assert.equal(profile!.follower_count, 1);
    assert.equal(profile!.following_count, 0);
  });

  await t.test("nobody can like, comment on, or follow what is hidden", async () => {
    await assert.rejects(community!.likePost(gonePost, BALA), /Post not found/);
    await assert.rejects(
      community!.addComment(gonePost, BALA, { content: "hello?" }),
      /Post not found/,
    );
    await assert.rejects(community!.followRider(BALA, GONE), /Rider not found/);
  });
});
