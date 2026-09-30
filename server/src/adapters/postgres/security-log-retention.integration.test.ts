import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Security logs are kept for a set time, then the hourly cleanup deletes
 * them (launch readiness E11, core/retention/retentionPolicy.ts): sign-in
 * history and the audit trail after a year, email codes after 30 days.
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

const RIDER = "5ec10900-0000-4000-8000-000000000001";
const EMAIL = "retention-test@example.test";
const EVENT = "test.retention";

const insertLogin = (pool: pg.Pool, fingerprint: string, ageDays: number) =>
  pool.query(
    `INSERT INTO login_activity (rider_id, device_fingerprint, ip_address, logged_in_at)
     VALUES ($1, $2, '203.0.113.7', now() - ($3 || ' days')::interval)`,
    [RIDER, fingerprint, String(ageDays)],
  );

const insertEvent = (pool: pg.Pool, reason: string, ageDays: number) =>
  pool.query(
    `INSERT INTO security_events (subject_id, event, reason, occurred_at)
     VALUES ($1, $2, $3, now() - ($4 || ' days')::interval)`,
    [RIDER, EVENT, reason, String(ageDays)],
  );

const insertCode = (pool: pg.Pool, codeHash: string, ageDays: number) =>
  pool.query(
    `INSERT INTO email_otps (email, code_hash, expires_at, ip, created_at)
     VALUES ($1, $2, now() - ($3 || ' days')::interval + interval '10 minutes',
             '203.0.113.7', now() - ($3 || ' days')::interval)`,
    [EMAIL, codeHash, String(ageDays)],
  );

const remaining = async (pool: pg.Pool) => {
  const logins = await pool.query(
    `SELECT device_fingerprint AS label FROM login_activity WHERE rider_id = $1 ORDER BY 1`,
    [RIDER],
  );
  const events = await pool.query(
    `SELECT reason AS label FROM security_events WHERE event = $1 ORDER BY 1`,
    [EVENT],
  );
  const codes = await pool.query(
    `SELECT code_hash AS label FROM email_otps WHERE email = $1 ORDER BY 1`,
    [EMAIL],
  );
  const labels = (result: pg.QueryResult) => result.rows.map((row) => row.label as string);
  return { logins: labels(logins), events: labels(events), codes: labels(codes) };
};

test("cleanup purges security logs past their retention", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     VALUES ($1, 'retention-rider@example.test', 'Retention', 'retentionrider')
     ON CONFLICT (id) DO NOTHING`,
    [RIDER],
  );
  await admin.query(`DELETE FROM login_activity WHERE rider_id = $1`, [RIDER]);
  await admin.query(`DELETE FROM security_events WHERE event = $1`, [EVENT]);
  await admin.query(`DELETE FROM email_otps WHERE email = $1`, [EMAIL]);

  await insertLogin(admin, "login-366d", 366);
  await insertLogin(admin, "login-364d", 364);
  await insertLogin(admin, "login-today", 0);
  await insertEvent(admin, "event-366d", 366);
  await insertEvent(admin, "event-364d", 364);
  await insertCode(admin, "code-31d", 31);
  await insertCode(admin, "code-29d", 29);

  const result = await cleanup!.processCleanupExpiredSessions({});

  await t.test("rows past their retention are gone; newer ones stay", async () => {
    assert.deepEqual(await remaining(admin), {
      logins: ["login-364d", "login-today"],
      events: ["event-364d"],
      codes: ["code-29d"],
    });
  });

  await t.test("the job result counts what it purged per table", async () => {
    const purged = result.securityLogsPurged as Record<
      "login_activity" | "security_events" | "email_otps",
      number
    >;
    assert.ok(purged.login_activity >= 1);
    assert.ok(purged.security_events >= 1);
    assert.ok(purged.email_otps >= 1);
  });

  await t.test("running it again removes nothing more", async () => {
    await cleanup!.processCleanupExpiredSessions({});
    const after = await remaining(admin);
    assert.equal(after.logins.length + after.events.length + after.codes.length, 4);
  });
});
