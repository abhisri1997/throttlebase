import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * In-app notifications and ride incidents are kept for a set time, then the
 * hourly cleanup deletes them (launch readiness E11,
 * core/retention/retentionPolicy.ts): notifications after 90 days,
 * incidents after 180.
 *
 * Deleting old notifications also deletes the marker the escalation job
 * checks before alerting leaders, so escalation must only ever consider
 * incidents on a session that is still live.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database (see
 * migrations.integration.test.ts for a container recipe).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
if (CONNECTION) {
  // The processors read the app pool's URL at import time.
  process.env.DATABASE_URL = CONNECTION;
}

const db = CONNECTION ? await import("../../config/db.js") : null;
const cleanup = CONNECTION
  ? await import("../../workers/processors/cleanup.processor.js")
  : null;
const liveOps = CONNECTION
  ? await import("../../workers/processors/live-ops.processor.js")
  : null;

const CAPTAIN = "5ec10900-0000-4000-8000-0000000000c1";
const REPORTER = "5ec10900-0000-4000-8000-0000000000c2";
const RIDERS = [CAPTAIN, REPORTER];
const TYPE = "test.retention";

const createSession = async (
  pool: pg.Pool,
  title: string,
  status: "active" | "ended",
): Promise<string> => {
  const ride = await pool.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, start_point, end_point)
     VALUES ($1, $2, $3, 'public', now() - interval '1 hour',
             ST_SetSRID(ST_MakePoint(77.6, 12.95), 4326)::geography,
             ST_SetSRID(ST_MakePoint(77.7, 13.0), 4326)::geography)
     RETURNING id`,
    [CAPTAIN, title, status === "active" ? "active" : "completed"],
  );
  const rideId = ride.rows[0].id as string;
  await pool.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now() - interval '1 hour'),
       ($1, $3, 'rider', 'confirmed', now() - interval '1 hour')`,
    [rideId, CAPTAIN, REPORTER],
  );
  const session = await pool.query(
    `INSERT INTO ride_live_sessions (ride_id, status, started_at, ended_at)
     VALUES ($1, $2, now() - interval '1 hour',
             CASE WHEN $2 = 'ended' THEN now() - interval '30 minutes' END)
     RETURNING id`,
    [rideId, status],
  );
  return session.rows[0].id as string;
};

const insertIncident = async (
  pool: pg.Pool,
  sessionId: string,
  label: string,
  ageMinutes: number,
): Promise<string> => {
  const result = await pool.query(
    `INSERT INTO ride_live_incidents (session_id, rider_id, severity, kind, location, metadata, created_at)
     VALUES ($1, $2, 'high', 'group_alert',
             ST_SetSRID(ST_MakePoint(77.65, 12.97), 4326)::geography,
             jsonb_build_object('label', $3::text),
             now() - ($4 || ' minutes')::interval)
     RETURNING id`,
    [sessionId, REPORTER, label, String(ageMinutes)],
  );
  return result.rows[0].id as string;
};

const insertNotification = (pool: pg.Pool, label: string, ageDays: number) =>
  pool.query(
    `INSERT INTO notifications (rider_id, type, title, created_at)
     VALUES ($1, $2, $3, now() - ($4 || ' days')::interval)`,
    [CAPTAIN, TYPE, label, String(ageDays)],
  );

const escalationsFor = async (pool: pg.Pool, incidentId: string): Promise<number> => {
  const result = await pool.query(
    `SELECT count(*)::int AS n FROM notifications
     WHERE type = 'live_incident_unacknowledged' AND data->>'incident_id' = $1`,
    [incidentId],
  );
  return result.rows[0].n as number;
};

test("notification and incident retention", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'retention-captain@example.test', 'Captain', 'retentioncaptain'),
       ($2, 'retention-reporter@example.test', 'Reporter', 'retentionreporter')
     ON CONFLICT (id) DO NOTHING`,
    RIDERS,
  );
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1)`, [RIDERS]);
  await admin.query(`DELETE FROM rides WHERE captain_id = $1`, [CAPTAIN]);

  await t.test("cleanup purges notifications after 90 days and incidents after 180", async () => {
    const sessionId = await createSession(admin, "retention-old", "ended");
    await insertNotification(admin, "notification-91d", 91);
    await insertNotification(admin, "notification-89d", 89);
    await insertIncident(admin, sessionId, "incident-181d", 181 * 24 * 60);
    await insertIncident(admin, sessionId, "incident-179d", 179 * 24 * 60);

    const result = await cleanup!.processCleanupExpiredSessions({});

    const notifications = await admin.query(
      `SELECT title FROM notifications WHERE rider_id = $1 AND type = $2 ORDER BY 1`,
      [CAPTAIN, TYPE],
    );
    const incidents = await admin.query(
      `SELECT metadata->>'label' AS label FROM ride_live_incidents WHERE session_id = $1 ORDER BY 1`,
      [sessionId],
    );
    assert.deepEqual(notifications.rows.map((row) => row.title), ["notification-89d"]);
    assert.deepEqual(incidents.rows.map((row) => row.label), ["incident-179d"]);

    const purged = result.retainedDataPurged as Record<"notifications" | "ride_live_incidents", number>;
    assert.ok(purged.notifications >= 1);
    assert.ok(purged.ride_live_incidents >= 1);
  });

  await t.test("escalation alerts leaders only while the session is live", async () => {
    const liveSession = await createSession(admin, "retention-live", "active");
    const endedSession = await createSession(admin, "retention-ended", "ended");
    const onLive = await insertIncident(admin, liveSession, "open-live", 5);
    const onEnded = await insertIncident(admin, endedSession, "open-ended", 5);

    await liveOps!.processLiveIncidentEscalation();

    assert.equal(await escalationsFor(admin, onLive), 1);
    assert.equal(await escalationsFor(admin, onEnded), 0);
  });
});
