import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * The worker writes a jobs row for every routine sweep, several a minute,
 * whether or not anyone is riding. The hourly cleanup keeps the table
 * bounded: finished jobs go after a retention window, and anything still
 * pending or running is never touched.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database (see
 * migrations.integration.test.ts for a container recipe).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
if (CONNECTION) {
  // The processor reads the app pool's URL at import time.
  process.env.DATABASE_URL = CONNECTION;
}

const db = CONNECTION ? await import("../../config/db.js") : null;
const cleanup = CONNECTION
  ? await import("../../workers/processors/cleanup.processor.js")
  : null;

const TYPE = "test.retention";

const insertJob = async (
  pool: pg.Pool,
  label: string,
  status: string,
  ageDays: number,
  finished: boolean,
): Promise<void> => {
  await pool.query(
    `INSERT INTO jobs (type, status, payload, created_at, updated_at, completed_at)
     VALUES ($1, $2, jsonb_build_object('label', $3::text),
             now() - ($4 || ' days')::interval,
             now() - ($4 || ' days')::interval,
             CASE WHEN $5 THEN now() - ($4 || ' days')::interval ELSE NULL END)`,
    [TYPE, status, label, String(ageDays), finished],
  );
};

const remainingLabels = async (pool: pg.Pool): Promise<string[]> => {
  const result = await pool.query(
    `SELECT payload->>'label' AS label FROM jobs WHERE type = $1 ORDER BY 1`,
    [TYPE],
  );
  return result.rows.map((row) => row.label as string);
};

test("cleanup keeps the jobs table bounded", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(`DELETE FROM jobs WHERE type = $1`, [TYPE]);

  await insertJob(admin, "completed-8d", "completed", 8, true);
  await insertJob(admin, "completed-6d", "completed", 6, true);
  await insertJob(admin, "cancelled-8d", "cancelled", 8, false);
  await insertJob(admin, "failed-31d", "failed", 31, true);
  await insertJob(admin, "failed-20d", "failed", 20, true);
  await insertJob(admin, "pending-40d", "pending", 40, false);
  await insertJob(admin, "processing-40d", "processing", 40, false);

  const result = await cleanup!.processCleanupExpiredSessions({});

  await t.test("finished jobs past their window are gone; everything else stays", async () => {
    assert.deepEqual(await remainingLabels(admin), [
      "completed-6d",
      "failed-20d",
      "pending-40d",
      "processing-40d",
    ]);
  });

  await t.test("the job result reports how many jobs it removed", async () => {
    assert.equal(typeof result.jobsDeleted, "number");
    assert.ok((result.jobsDeleted as number) >= 3);
  });

  await t.test("running it again removes nothing more", async () => {
    await cleanup!.processCleanupExpiredSessions({});
    assert.equal((await remainingLabels(admin)).length, 4);
  });
});
