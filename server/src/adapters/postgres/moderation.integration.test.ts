import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";
import { createRegistrationSealer } from "../crypto/registrationSealer.js";
import { generateSealingKeyPair } from "../crypto/sealedBox.js";

const testSealer = createRegistrationSealer(generateSealingKeyPair().publicKeyPem);

/**
 * A moderator works the report queue: removes posts, comments and routes,
 * dismisses reports, suspends and reinstates riders. Removed content is
 * hidden from everyone and purged after 180 days. A suspended rider is
 * signed out, can't sign in, and their content is hidden until the
 * suspension is lifted. Every action closes the reports, tells the rider
 * (except dismissals) and lands in the audit log.
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
const moderation = CONNECTION ? await import("../../services/moderation.service.js") : null;
const reports = CONNECTION ? await import("../../services/report.service.js") : null;
const community = CONNECTION ? await import("../../services/community.service.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;
const riders = CONNECTION ? await import("../../services/rider.service.js") : null;
const blocks = CONNECTION ? await import("../../services/blocks.js") : null;
const cleanup = CONNECTION ? await import("../../workers/processors/cleanup.processor.js") : null;
const riderRepo = CONNECTION ? await import("./riderRepository.js") : null;

const MOD = "a0a0a0a0-0000-0000-0000-0000000000f0"; // admin
const ASHA = "a1a1a1a1-0000-0000-0000-0000000000f1"; // reports
const BALA = "b2b2b2b2-0000-0000-0000-0000000000f2"; // is reported
const CHITRA = "c3c3c3c3-0000-0000-0000-0000000000f3"; // just looks
const RIDERS = [MOD, ASHA, BALA, CHITRA];

const LINE = `{"type":"LineString","coordinates":[[77.6,12.9],[77.7,13.0]]}`;
const REASON = "Harassing another rider";

const ids = (rows: Array<{ id: string }>): string[] => rows.map((row) => row.id);

test("the moderation queue, removals and suspensions", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at, suspended_at) VALUES
       ($1, 'mod-mod@example.test', 'Moderator', 'modmod', NULL, NULL),
       ($2, 'mod-asha@example.test', 'Asha', 'modasha', NULL, NULL),
       ($3, 'mod-bala@example.test', 'Bala', 'modbala', NULL, NULL),
       ($4, 'mod-chitra@example.test', 'Chitra', 'modchitra', NULL, NULL)
     ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL`,
    RIDERS,
  );
  await admin.query(`DELETE FROM reports WHERE reporter_id = ANY($1) OR target_rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM security_events WHERE actor_id = ANY($1) OR subject_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM posts WHERE rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM sessions WHERE rider_id = ANY($1)`, [RIDERS]);

  const post = async (riderId: string, content: string): Promise<string> =>
    (await admin.query(`INSERT INTO posts (rider_id, content) VALUES ($1, $2) RETURNING id`, [riderId, content]))
      .rows[0].id as string;

  const badPost = await post(BALA, "Bala's nasty post");
  const otherPost = await post(BALA, "Bala's ordinary post");
  const ashaPost = await post(ASHA, "Asha's post");
  await admin.query(`INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'A reply on the nasty post')`, [
    badPost,
    CHITRA,
  ]);
  const badComment = (
    await admin.query(
      `INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'Bala''s nasty comment') RETURNING id`,
      [ashaPost, BALA],
    )
  ).rows[0].id as string;
  const badRoute = (
    await admin.query(
      `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name)
       VALUES ($1, 'Street race loop', $2, 'public', 'Bengaluru', 'Nandi Hills') RETURNING id`,
      [BALA, LINE],
    )
  ).rows[0].id as string;
  const balaRide = (
    await admin.query(
      `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
       VALUES ($1, 'Bala''s ride', 'scheduled', 'public', now() + interval '2 days') RETURNING id`,
      [BALA],
    )
  ).rows[0].id as string;
  await admin.query(
    `INSERT INTO sessions (rider_id, refresh_token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '30 days')`,
    [BALA],
  );

  await reports!.createReport(ASHA, { target_type: "post", target_id: badPost, reason: "harassment", note: "About me" });
  await reports!.createReport(CHITRA, { target_type: "post", target_id: badPost, reason: "hate" });
  await reports!.createReport(ASHA, { target_type: "comment", target_id: badComment, reason: "harassment" });
  await reports!.createReport(ASHA, { target_type: "route", target_id: badRoute, reason: "dangerous_riding" });
  await reports!.createReport(ASHA, { target_type: "ride", target_id: balaRide, reason: "spam" });
  await reports!.createReport(ASHA, { target_type: "rider", target_id: BALA, reason: "harassment" });

  await t.test("the queue shows one row per reported thing, with who made it and why", async () => {
    const queue = await moderation!.listQueue();
    const postRow = queue.find((item) => item.target_id === badPost);
    assert.ok(postRow);
    assert.equal(postRow.report_count, 2);
    assert.deepEqual([...postRow.reasons].sort(), ["harassment", "hate"]);
    assert.deepEqual(postRow.notes, ["About me"]);
    assert.equal(postRow.owner_id, BALA);
    assert.equal(postRow.owner_name, "Bala");
    assert.equal(postRow.preview, "Bala's nasty post");
    assert.equal(postRow.removed, false);
    assert.ok(queue.some((item) => item.target_id === BALA && item.preview === "Bala"));
  });

  await t.test("an action needs a reason, and rides can't be removed", async () => {
    await assert.rejects(
      moderation!.takeAction(MOD, { target_type: "post", target_id: badPost, action: "remove", reason: " " }),
      (error: Error & { kind?: string }) => error.kind === "reason_required",
    );
    await assert.rejects(
      moderation!.takeAction(MOD, { target_type: "ride", target_id: balaRide, action: "remove", reason: REASON }),
      (error: Error & { kind?: string }) => error.kind === "not_removable",
    );
  });

  await t.test("a removed post is hidden from everyone, with its thread, and its author can't edit or delete it", async () => {
    const outcome = await moderation!.takeAction(MOD, {
      target_type: "post",
      target_id: badPost,
      action: "remove",
      reason: REASON,
    });
    assert.equal(outcome.reportsClosed, 2);
    assert.equal(outcome.notified, true);

    assert.equal(ids(await community!.getFeed(200, 0, CHITRA)).includes(badPost), false);
    assert.equal(ids(await community!.getFeed(200, 0, BALA)).includes(badPost), false);
    assert.equal(await community!.getPostById(badPost, CHITRA), null);
    assert.deepEqual(await community!.getComments(badPost, CHITRA), []);
    await assert.rejects(community!.likePost(badPost, CHITRA), /Post not found/);
    assert.equal(await community!.updatePost(badPost, BALA, { content: "edited" }), null);
    assert.equal(await community!.deletePost(badPost, BALA), false);

    const statuses = await admin.query(`SELECT DISTINCT status FROM reports WHERE target_id = $1`, [badPost]);
    assert.deepEqual(statuses.rows.map((row) => row.status), ["actioned"]);
  });

  await t.test("the author is told why, once, and the action is in the audit log", async () => {
    await moderation!.takeAction(MOD, { target_type: "post", target_id: badPost, action: "remove", reason: REASON });

    const notices = await admin.query(`SELECT title, body FROM notifications WHERE rider_id = $1 AND type = 'moderation_remove'`, [
      BALA,
    ]);
    assert.equal(notices.rows.length, 1, "removing again doesn't tell them twice");
    assert.equal(notices.rows[0].title, "Your post was removed");
    assert.match(notices.rows[0].body, /Harassing another rider/);

    const events = await admin.query(
      `SELECT actor_id, subject_id, event, reason FROM security_events WHERE target_id = $1 ORDER BY id`,
      [badPost],
    );
    assert.equal(events.rows.length, 2);
    assert.deepEqual(events.rows[0], { actor_id: MOD, subject_id: BALA, event: "moderation.remove", reason: REASON });
  });

  await t.test("a removed comment and a removed route are hidden, the route even from its creator", async () => {
    await moderation!.takeAction(MOD, { target_type: "comment", target_id: badComment, action: "remove", reason: REASON });
    const comments = await community!.getComments(ashaPost, ASHA);
    assert.equal(comments.some((c: { id: string }) => c.id === badComment), false);
    const ashaPostView = await community!.getPostById(ashaPost, ASHA);
    assert.equal(ashaPostView.comment_count, 0);

    await moderation!.takeAction(MOD, { target_type: "route", target_id: badRoute, action: "remove", reason: REASON });
    assert.equal(await routes!.getRouteById(badRoute, CHITRA), null);
    assert.equal(await routes!.getRouteById(badRoute, BALA), null);
    assert.equal(ids(await routes!.listVisibleRoutes(CHITRA)).includes(badRoute), false);
  });

  await t.test("dismissing closes the reports without telling anyone", async () => {
    const outcome = await moderation!.takeAction(MOD, {
      target_type: "ride",
      target_id: balaRide,
      action: "dismiss",
      reason: "Not against the guidelines",
    });
    assert.equal(outcome.reportsClosed, 1);
    assert.equal(outcome.notified, false);
    const status = await admin.query(`SELECT status FROM reports WHERE target_id = $1`, [balaRide]);
    assert.equal(status.rows[0].status, "dismissed");
  });

  await t.test("a moderator can't suspend themselves", async () => {
    await reports!.createReport(ASHA, { target_type: "rider", target_id: MOD, reason: "other", note: "test" });
    await assert.rejects(
      moderation!.takeAction(MOD, { target_type: "rider", target_id: MOD, action: "suspend", reason: REASON }),
      (error: Error & { kind?: string }) => error.kind === "own_account",
    );
  });

  await t.test("a suspended rider is signed out, can't sign in, and their content is hidden", async () => {
    await moderation!.takeAction(MOD, { target_type: "rider", target_id: BALA, action: "suspend", reason: REASON });

    const sessions = await admin.query(`SELECT revoked_at FROM sessions WHERE rider_id = $1`, [BALA]);
    assert.ok(sessions.rows.every((row) => row.revoked_at !== null));

    const repo = riderRepo!.createRiderRepository(db!.default, testSealer);
    const record = await repo.withTransaction((tx) => tx.findRiderById(BALA));
    assert.equal(record?.suspended, true, "sign-in reads the suspension");

    assert.equal(ids(await community!.getFeed(200, 0, CHITRA)).includes(otherPost), false);
    assert.equal(await blocks!.isHiddenFrom(CHITRA, BALA), true);
    assert.deepEqual(await riders!.searchMentionSuggestions(CHITRA, "modbala"), []);
    await assert.rejects(community!.followRider(CHITRA, BALA), /Rider not found/);

    const listed = (await moderation!.listSuspended()).map((row: { id: string }) => row.id);
    assert.ok(listed.includes(BALA));
    await assert.rejects(
      moderation!.takeAction(MOD, { target_type: "rider", target_id: BALA, action: "suspend", reason: REASON }),
      (error: Error & { kind?: string }) => error.kind === "already_suspended",
    );
  });

  await t.test("lifting the suspension shows their content again and tells them", async () => {
    await moderation!.takeAction(MOD, { target_type: "rider", target_id: BALA, action: "lift_suspension", reason: "Appeal upheld" });
    assert.ok(ids(await community!.getFeed(200, 0, CHITRA)).includes(otherPost));
    assert.equal(await blocks!.isHiddenFrom(CHITRA, BALA), false);
    const notice = await admin.query(
      `SELECT title FROM notifications WHERE rider_id = $1 AND type = 'moderation_lift_suspension'`,
      [BALA],
    );
    assert.equal(notice.rows[0]?.title, "Your account is active again");
  });

  await t.test("removed content is purged after 180 days, not before", async () => {
    await admin.query(`UPDATE posts SET removed_at = now() - interval '181 days' WHERE id = $1`, [badPost]);
    await admin.query(`UPDATE comments SET removed_at = now() - interval '10 days' WHERE id = $1`, [badComment]);

    await cleanup!.processCleanupExpiredSessions({});

    assert.equal((await admin.query(`SELECT 1 FROM posts WHERE id = $1`, [badPost])).rows.length, 0);
    assert.equal((await admin.query(`SELECT 1 FROM comments WHERE id = $1`, [badComment])).rows.length, 1);
    assert.equal((await admin.query(`SELECT 1 FROM routes WHERE id = $1`, [badRoute])).rows.length, 1);
  });
});
