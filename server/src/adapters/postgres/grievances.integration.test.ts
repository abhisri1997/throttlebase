import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Reports as grievances: acknowledged on receipt with a reference, given a
 * deadline by what they're about, worked in deadline order, and each
 * reporter hears how theirs was resolved and can follow it in the app.
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
const moderation = CONNECTION ? await import("../../services/moderation.service.js") : null;

const MOD = "a0a0a0a0-0000-0000-0000-0000000000d0";
const ASHA = "a1a1a1a1-0000-0000-0000-0000000000d1";
const CHITRA = "c3c3c3c3-0000-0000-0000-0000000000d3";
const BALA = "b2b2b2b2-0000-0000-0000-0000000000d2";
const RIDERS = [MOD, ASHA, CHITRA, BALA];

const HOUR_MS = 60 * 60 * 1000;

test("reports as grievances", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'grv-mod@example.test', 'Moderator', 'grvmod'),
       ($2, 'grv-asha@example.test', 'Asha', 'grvasha'),
       ($3, 'grv-chitra@example.test', 'Chitra', 'grvchitra'),
       ($4, 'grv-bala@example.test', 'Bala', 'grvbala')
     ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, suspended_at = NULL`,
    RIDERS,
  );
  await admin.query(`DELETE FROM reports WHERE reporter_id = ANY($1) OR target_rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM posts WHERE rider_id = ANY($1)`, [RIDERS]);
  // Other tests' open reports would share the queue; only these riders' rows are checked.

  const post = async (content: string): Promise<string> =>
    (await admin.query(`INSERT INTO posts (rider_id, content) VALUES ($1, $2) RETURNING id`, [BALA, content])).rows[0]
      .id as string;
  const harassing = await post("harassing post");
  const explicit = await post("explicit post");

  await t.test("a report is acknowledged on receipt, with a reference and a 7-day deadline", async () => {
    const before = Date.now();
    const outcome = await reports!.createReport(ASHA, { target_type: "post", target_id: harassing, reason: "harassment" });
    assert.match(outcome.report.reference, /^R-[0-9A-F]{8}$/);

    const row = (await admin.query(`SELECT created_at, acknowledged_at, resolve_due_at FROM reports WHERE id = $1`, [
      outcome.report.id,
    ])).rows[0];
    assert.equal(row.acknowledged_at.getTime(), row.created_at.getTime());
    assert.equal(row.resolve_due_at.getTime() - row.created_at.getTime(), 7 * 24 * HOUR_MS);
    assert.ok(row.created_at.getTime() >= before - 1000);

    const notice = await admin.query(`SELECT title, body FROM notifications WHERE rider_id = $1 AND type = 'report_received'`, [
      ASHA,
    ]);
    assert.equal(notice.rows.length, 1);
    assert.equal(notice.rows[0].title, `We received your report ${outcome.report.reference}`);
  });

  await t.test("reporting the same thing again isn't acknowledged twice", async () => {
    await reports!.createReport(ASHA, { target_type: "post", target_id: harassing, reason: "spam" });
    const notices = await admin.query(`SELECT 1 FROM notifications WHERE rider_id = $1 AND type = 'report_received'`, [ASHA]);
    assert.equal(notices.rows.length, 1);
  });

  await t.test("sexual content is due in 72 hours, and jumps ahead in the queue", async () => {
    const outcome = await reports!.createReport(CHITRA, { target_type: "post", target_id: explicit, reason: "sexual" });
    const row = (await admin.query(`SELECT created_at, resolve_due_at FROM reports WHERE id = $1`, [outcome.report.id]))
      .rows[0];
    assert.equal(row.resolve_due_at.getTime() - row.created_at.getTime(), 72 * HOUR_MS);

    const mine = (await moderation!.listQueue()).filter((item) => [harassing, explicit].includes(item.target_id));
    assert.deepEqual(
      mine.map((item) => item.target_id),
      [explicit, harassing],
      "the newer report is due sooner, so it comes first",
    );
  });

  await t.test("a report past its deadline shows as overdue", async () => {
    await admin.query(`UPDATE reports SET resolve_due_at = now() - interval '1 hour' WHERE target_id = $1`, [harassing]);
    const item = (await moderation!.listQueue()).find((row) => row.target_id === harassing);
    assert.equal(item?.overdue, true);

    const mine = await reports!.listMyReports(ASHA);
    assert.equal(mine[0]?.overdue, true);
  });

  await t.test("a rider sees their own reports and where each stands", async () => {
    const mine = await reports!.listMyReports(ASHA);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]?.status, "open");
    assert.match(mine[0]!.outcome, /reviewing/);
    assert.equal((await reports!.listMyReports(BALA)).length, 0, "the reported rider doesn't see reports about them");
  });

  await t.test("resolving tells each reporter the outcome, and nothing about who or what", async () => {
    await moderation!.takeAction(MOD, {
      target_type: "post",
      target_id: harassing,
      action: "dismiss",
      reason: "Not against the guidelines",
    });

    const mine = await reports!.listMyReports(ASHA);
    assert.equal(mine[0]?.status, "dismissed");
    assert.equal(mine[0]?.overdue, false);
    assert.match(mine[0]!.outcome, /didn't break/);

    const update = await admin.query(
      `SELECT title, body FROM notifications WHERE rider_id = $1 AND type = 'report_resolved'`,
      [ASHA],
    );
    assert.equal(update.rows.length, 1);
    assert.match(update.rows[0].title, /^Update on your report R-/);
    assert.doesNotMatch(update.rows[0].body, /Bala|Not against/);

    await moderation!.takeAction(MOD, { target_type: "post", target_id: explicit, action: "remove", reason: "Sexual content" });
    const chitra = await reports!.listMyReports(CHITRA);
    assert.equal(chitra[0]?.status, "actioned");
    assert.match(chitra[0]!.outcome, /took action/);
  });
});
