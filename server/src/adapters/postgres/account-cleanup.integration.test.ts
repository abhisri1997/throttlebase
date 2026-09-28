import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * The hourly cleanup must never hard-delete a rider. Deleting the riders row
 * fires every ON DELETE CASCADE, and rides.captain_id is one of them: a rider
 * who deleted their account would take every ride they captained with them,
 * along with the other riders' participation, tracks and stats. Deleting an
 * account may only ever remove that rider's own data.
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

const LEAVER = "dddddddd-0000-0000-0000-0000000000c1";
const STAYER = "eeeeeeee-0000-0000-0000-0000000000c2";

const countOf = async (pool: pg.Pool, sql: string, params: unknown[]): Promise<number> => {
  const result = await pool.query(sql, params);
  return Number(result.rows[0].count);
};

test("cleanup never removes other riders' data", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);

  // The leaver deleted their account 31 days ago: past the old 30-day purge.
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at) VALUES
       ($1, NULL, 'Deleted rider', NULL, now() - interval '31 days'),
       ($2, 'stayer@example.test', 'Stayer', 'cleanupstayer', NULL)
     ON CONFLICT (id) DO NOTHING`,
    [LEAVER, STAYER],
  );

  const ride = await admin.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
     VALUES ($1, 'Sunday loop', 'completed', 'public', now() - interval '40 days')
     RETURNING id`,
    [LEAVER],
  );
  const rideId = ride.rows[0].id as string;

  await admin.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now() - interval '40 days'),
       ($1, $3, 'rider', 'confirmed', now() - interval '40 days')`,
    [rideId, LEAVER, STAYER],
  );
  await admin.query(
    `INSERT INTO ride_history_stats (ride_id, rider_id, total_distance_km, total_time_sec)
     VALUES ($1, $2, 42.5, 5400)`,
    [rideId, STAYER],
  );

  const session = await admin.query(
    `INSERT INTO ride_live_sessions (ride_id, status, started_at, ended_at)
     VALUES ($1, 'ended', now() - interval '40 days', now() - interval '40 days')
     RETURNING id`,
    [rideId],
  );
  await admin.query(
    `INSERT INTO ride_live_location_samples (session_id, rider_id, location, captured_at)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326)::geography, now() - interval '40 days')`,
    [session.rows[0].id, STAYER],
  );

  // One revoked session, which the cleanup should still purge.
  await admin.query(
    `INSERT INTO sessions (rider_id, refresh_token_hash, expires_at, revoked_at)
     VALUES ($1, 'cleanup-test-revoked', now() + interval '1 day', now())`,
    [STAYER],
  );

  await cleanup!.processCleanupExpiredSessions({});

  await t.test("the deleted rider's row stays, holding no personal data", async () => {
    const leaver = await admin.query(
      `SELECT email, username, deleted_at FROM riders WHERE id = $1`,
      [LEAVER],
    );
    assert.equal(leaver.rows.length, 1);
    assert.equal(leaver.rows[0].email, null);
    assert.equal(leaver.rows[0].username, null);
    assert.notEqual(leaver.rows[0].deleted_at, null);
  });

  await t.test("the ride they captained survives for everyone else", async () => {
    assert.equal(await countOf(admin, `SELECT count(*) FROM rides WHERE id = $1`, [rideId]), 1);
  });

  await t.test("the other rider keeps their participation, stats and track", async () => {
    assert.equal(
      await countOf(
        admin,
        `SELECT count(*) FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
        [rideId, STAYER],
      ),
      1,
    );
    assert.equal(
      await countOf(
        admin,
        `SELECT count(*) FROM ride_history_stats WHERE ride_id = $1 AND rider_id = $2`,
        [rideId, STAYER],
      ),
      1,
    );
    assert.equal(
      await countOf(
        admin,
        `SELECT count(*) FROM ride_live_location_samples WHERE rider_id = $1`,
        [STAYER],
      ),
      1,
    );
  });

  await t.test("revoked sessions are still purged", async () => {
    assert.equal(
      await countOf(
        admin,
        `SELECT count(*) FROM sessions WHERE refresh_token_hash = 'cleanup-test-revoked'`,
        [],
      ),
      0,
    );
  });
});
