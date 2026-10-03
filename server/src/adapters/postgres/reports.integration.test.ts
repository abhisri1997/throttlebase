import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Riders report what other riders made, once per thing while it is open,
 * never their own, and can block the maker in the same step. The word
 * filter refuses posts and comments, new or edited, before anything is
 * stored.
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
const reports = CONNECTION ? await import("../../services/report.service.js") : null;
const community = CONNECTION ? await import("../../services/community.service.js") : null;
const blocks = CONNECTION ? await import("../../services/blocks.js") : null;

const DEVI = "d7d7d7d7-0000-0000-0000-0000000000e1"; // reports
const EZRA = "e8e8e8e8-0000-0000-0000-0000000000e2"; // is reported
const GONE = "f9f9f9f9-0000-0000-0000-0000000000e3"; // left, route kept
const RIDERS = [DEVI, EZRA, GONE];
const MISSING = "00000000-0000-0000-0000-00000000dead";

const LINE = `{"type":"LineString","coordinates":[[77.6,12.9],[77.7,13.0]]}`;

test("reports and the word filter", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at) VALUES
       ($1, 'rep-devi@example.test', 'Devi', 'repdevi', NULL),
       ($2, 'rep-ezra@example.test', 'Ezra', 'repezra', NULL),
       ($3, NULL, 'Deleted rider', NULL, now())
     ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
    RIDERS,
  );
  await admin.query(`DELETE FROM reports WHERE reporter_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM blocked_riders WHERE blocker_id = ANY($1) OR blocked_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM posts WHERE rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1)`, [RIDERS]);

  const ezraPost = (
    await admin.query(`INSERT INTO posts (rider_id, content) VALUES ($1, 'Ezra''s post') RETURNING id`, [EZRA])
  ).rows[0].id as string;
  const deviPost = (
    await admin.query(`INSERT INTO posts (rider_id, content) VALUES ($1, 'Devi''s post') RETURNING id`, [DEVI])
  ).rows[0].id as string;
  const keptRoute = (
    await admin.query(
      `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name)
       VALUES ($1, 'Kept route', $2, 'public', 'Bengaluru', 'Nandi Hills') RETURNING id`,
      [GONE, LINE],
    )
  ).rows[0].id as string;

  await t.test("a report is stored with who made the reported thing", async () => {
    const outcome = await reports!.createReport(DEVI, {
      target_type: "post",
      target_id: ezraPost,
      reason: "harassment",
      note: "Keeps posting about me",
    });
    assert.equal(outcome.alreadyReported, false);
    assert.equal(outcome.blocked, false);
    assert.equal(outcome.report.status, "open");

    const row = (await admin.query(`SELECT * FROM reports WHERE id = $1`, [outcome.report.id])).rows[0];
    assert.equal(row.reporter_id, DEVI);
    assert.equal(row.target_rider_id, EZRA);
    assert.equal(row.reason, "harassment");
    assert.equal(row.note, "Keeps posting about me");
  });

  await t.test("reporting the same thing again while open changes nothing", async () => {
    const again = await reports!.createReport(DEVI, { target_type: "post", target_id: ezraPost, reason: "spam" });
    assert.equal(again.alreadyReported, true);
    const count = await admin.query(`SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND target_id = $2`, [
      DEVI,
      ezraPost,
    ]);
    assert.equal(count.rows[0].n, 1);
  });

  await t.test("once the first report is closed, the same thing can be reported again", async () => {
    await admin.query(`UPDATE reports SET status = 'dismissed', resolved_at = now() WHERE reporter_id = $1 AND target_id = $2`, [
      DEVI,
      ezraPost,
    ]);
    const fresh = await reports!.createReport(DEVI, { target_type: "post", target_id: ezraPost, reason: "spam" });
    assert.equal(fresh.alreadyReported, false);
  });

  await t.test("nobody reports their own content, or what doesn't exist", async () => {
    await assert.rejects(
      reports!.createReport(DEVI, { target_type: "post", target_id: deviPost, reason: "spam" }),
      (error: Error & { kind?: string }) => error.kind === "own_content",
    );
    await assert.rejects(
      reports!.createReport(DEVI, { target_type: "rider", target_id: DEVI, reason: "spam" }),
      (error: Error & { kind?: string }) => error.kind === "own_content",
    );
    await assert.rejects(
      reports!.createReport(DEVI, { target_type: "ride", target_id: MISSING, reason: "spam" }),
      (error: Error & { kind?: string }) => error.kind === "not_found",
    );
    await assert.rejects(
      reports!.createReport(DEVI, { target_type: "rider", target_id: GONE, reason: "spam" }),
      (error: Error & { kind?: string }) => error.kind === "not_found",
      "a deleted account can't be reported as a rider",
    );
  });

  await t.test("a route kept after its creator left can still be reported", async () => {
    const outcome = await reports!.createReport(DEVI, { target_type: "route", target_id: keptRoute, reason: "dangerous_riding" });
    assert.equal(outcome.alreadyReported, false);
  });

  await t.test("reporting a rider can block them in the same step", async () => {
    const outcome = await reports!.createReport(DEVI, {
      target_type: "rider",
      target_id: EZRA,
      reason: "harassment",
      also_block: true,
    });
    assert.equal(outcome.blocked, true);
    assert.equal(await blocks!.isBlockedBetween(DEVI, EZRA), true);
  });

  await t.test("the word filter refuses posts and comments, new or edited, and stores nothing", async () => {
    const before = (await admin.query(`SELECT count(*)::int AS n FROM posts WHERE rider_id = $1`, [DEVI])).rows[0].n;

    await assert.rejects(community!.createPost(DEVI, { content: "You absolute b1tch" }), /isn't allowed/);
    await assert.rejects(community!.updatePost(deviPost, DEVI, { content: "go die" }), /isn't allowed/);
    await assert.rejects(community!.addComment(deviPost, DEVI, { content: "F U C K this" }), /isn't allowed/);

    const after = (await admin.query(`SELECT count(*)::int AS n FROM posts WHERE rider_id = $1`, [DEVI])).rows[0].n;
    assert.equal(after, before);
    const post = (await admin.query(`SELECT content FROM posts WHERE id = $1`, [deviPost])).rows[0];
    assert.equal(post.content, "Devi's post");
    const comments = (await admin.query(`SELECT count(*)::int AS n FROM comments WHERE post_id = $1`, [deviPost])).rows[0].n;
    assert.equal(comments, 0);
  });

  await t.test("ordinary riding talk goes through", async () => {
    const post = await community!.createPost(DEVI, { content: "Killer ghat roads, class weekend. Assemble at 6!" });
    assert.ok(post.id);
  });
});
