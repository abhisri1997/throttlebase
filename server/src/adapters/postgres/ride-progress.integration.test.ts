import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Per-rider ride progress against a real Postgres + PostGIS: early starts,
 * arrival, finishing, the captain's end-ride warning, the auto-finish and
 * idle sweeps, and the stats cutoff. The services run exactly as in the API,
 * through the app pool pointed at the throwaway database.
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
const liveSession = CONNECTION ? await import("../../services/live-session.service.js") : null;
const rideProgress = CONNECTION ? await import("../../services/ride-progress.service.js") : null;
const stats = CONNECTION ? await import("../../services/stats.service.js") : null;
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;

const CAPTAIN = "cccccccc-0000-0000-0000-000000000001";
const RIDER_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const RIDER_B = "bbbbbbbb-0000-0000-0000-00000000000b";

/** The destination; test positions sit due north of it (1° of latitude ≈ 111,320 m). */
const DEST = { lon: 77.6, lat: 12.9 };
const latNorthBy = (metres: number): number => DEST.lat + metres / 111_320;
const secondsAgo = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString();

const createRide = async (pool: pg.Pool, title: string): Promise<string> => {
  const ride = await pool.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, start_point, end_point)
     VALUES ($1, $2, 'scheduled', 'public', now() + interval '30 minutes',
             ST_SetSRID(ST_MakePoint(77.6, 12.95), 4326)::geography,
             ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
     RETURNING id`,
    [CAPTAIN, title, DEST.lon, DEST.lat],
  );
  const rideId = ride.rows[0].id as string;
  await pool.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now()),
       ($1, $3, 'rider', 'confirmed', now()),
       ($1, $4, 'rider', 'confirmed', now())`,
    [rideId, CAPTAIN, RIDER_A, RIDER_B],
  );
  return rideId;
};

/** A position `metresNorth` of the destination, captured `ageSeconds` ago. */
const sendFix = (rideId: string, riderId: string, metresNorth: number, ageSeconds: number) =>
  liveSession!.updateLivePresenceLocation(
    rideId,
    riderId,
    { lon: DEST.lon, lat: latNorthBy(metresNorth), accuracy_m: 8, captured_at: secondsAgo(ageSeconds) },
    { persistSample: true },
  );

const sampleCount = async (pool: pg.Pool, rideId: string, riderId: string): Promise<number> => {
  const result = await pool.query(
    `SELECT count(*)::int AS n
     FROM ride_live_location_samples s
     JOIN ride_live_sessions ls ON ls.id = s.session_id
     WHERE ls.ride_id = $1 AND s.rider_id = $2`,
    [rideId, riderId],
  );
  return result.rows[0].n as number;
};

const progressOf = async (pool: pg.Pool, rideId: string, riderId: string) => {
  const result = await pool.query(
    `SELECT p.ride_started_at, p.finished_at, p.finish_reason, p.arrived_at
     FROM ride_live_presence p
     JOIN ride_live_sessions s ON s.id = p.session_id
     WHERE s.ride_id = $1 AND p.rider_id = $2`,
    [rideId, riderId],
  );
  return result.rows[0];
};

test("per-rider ride progress", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'captain@example.test', 'Captain', 'captain'),
       ($2, 'a@example.test', 'Rider A', 'ridera'),
       ($3, 'b@example.test', 'Rider B', 'riderb')
     ON CONFLICT (id) DO NOTHING`,
    [CAPTAIN, RIDER_A, RIDER_B],
  );

  await t.test("a rider starts early, arrives and finishes while the rest still ride", async () => {
    const rideId = await createRide(admin, "Early start");

    // A starts before the captain has opened anything: the start opens the roll call.
    const started = await rideProgress!.startOwnRide(rideId, RIDER_A);
    assert.equal(started.openedSession, true);
    assert.equal(started.session?.status, "starting");

    // B is in the roll call but has not started: shared, not recorded.
    await sendFix(rideId, RIDER_B, 5_000, 100);
    assert.equal(await sampleCount(admin, rideId, RIDER_B), 0);

    // Only A's phone should be tracking in the background.
    const ridingIds = async (riderId: string) =>
      (await rideProgress!.listRidesBeingRidden(riderId)).map((ride) => ride.id);
    assert.ok((await ridingIds(RIDER_A)).includes(rideId));
    assert.ok(!(await ridingIds(RIDER_B)).includes(rideId));

    // A rides in: 1 km out (arms), 500 m, then inside the arrival radius.
    const far = await sendFix(rideId, RIDER_A, 1_000, 110);
    const mid = await sendFix(rideId, RIDER_A, 500, 80);
    const near = await sendFix(rideId, RIDER_A, 55, 50);
    assert.equal(far?.arrival, "armed");
    assert.equal(mid?.arrival, "none");
    assert.equal(near?.arrival, "arrived");

    // Parking 250 m off: between the radii, so still arrived.
    const parking = await sendFix(rideId, RIDER_A, 250, 20);
    assert.equal(parking?.arrival, "none");

    // The captain's start is now just the roll call on the session A opened.
    const captainStart = await liveSession!.startLiveSession(rideId, CAPTAIN);
    assert.equal(captainStart.started, false);

    // Finishing 250 m out still counts as arrived, dated to the arrival.
    const finished = await rideProgress!.finishOwnRide(rideId, RIDER_A);
    assert.equal(finished.reason, "arrived");
    assert.equal(finished.closedSession, null, "a roll call does not complete itself");
    const a = await progressOf(admin, rideId, RIDER_A);
    assert.equal(new Date(a.finished_at).getTime(), new Date(a.arrived_at).getTime());

    // A finished rider shares nothing further, and their phone stops tracking.
    assert.equal(await sendFix(rideId, RIDER_A, 3_000, 5), null);
    assert.ok(!(await ridingIds(RIDER_A)).includes(rideId));

    // History shows A's ride while the group is still out.
    const history = await rides!.getRideHistory(RIDER_A);
    assert.ok(history.some((ride) => ride.id === rideId));

    // Rolling out starts B, who had turned up for the roll call.
    await liveSession!.rollOutLiveSession(rideId, CAPTAIN);
    assert.ok((await progressOf(admin, rideId, RIDER_B)).ride_started_at);
    assert.ok((await ridingIds(RIDER_B)).includes(rideId));
    await sendFix(rideId, RIDER_B, 5_000, 10);

    // Ending with B still 5 km out needs the captain's confirmation.
    await assert.rejects(
      liveSession!.endLiveSession(rideId, CAPTAIN, { mark_ride_completed: true }),
      (error: unknown) =>
        error instanceof liveSession!.UnfinishedRidersError &&
        error.riders.length === 1 &&
        error.riders[0]!.rider_id === RIDER_B,
    );

    const ended = await liveSession!.endLiveSession(rideId, CAPTAIN, {
      mark_ride_completed: true,
      confirm_unfinished: true,
    });
    assert.equal(ended.ended, true);
    const participants = ended.session?.participants ?? [];
    assert.equal(participants.find((p) => p.rider_id === RIDER_A)?.progress, "arrived");
    assert.equal(participants.find((p) => p.rider_id === RIDER_B)?.progress, "group_ended");

    const rideRow = await admin.query(`SELECT status FROM rides WHERE id = $1`, [rideId]);
    assert.equal(rideRow.rows[0].status, "completed");

    // A's distance stops at the arrival: ~945 m ridden, the 195 m of parking left out.
    await stats!.recomputeRideHistoryStats(rideId);
    const aStats = await admin.query(
      `SELECT total_distance_km FROM ride_history_stats WHERE ride_id = $1 AND rider_id = $2`,
      [rideId, RIDER_A],
    );
    const km = Number(aStats.rows[0].total_distance_km);
    assert.ok(km > 0.9 && km < 1.0, `expected ~0.94 km, got ${km}`);
  });

  await t.test("resuming at the destination keeps the rider arrived", async () => {
    const rideId = await createRide(admin, "Resume");
    await rideProgress!.startOwnRide(rideId, RIDER_A);
    await sendFix(rideId, RIDER_A, 1_000, 60);
    await sendFix(rideId, RIDER_A, 50, 30);
    await rideProgress!.finishOwnRide(rideId, RIDER_A);

    const resumed = await rideProgress!.resumeOwnRide(rideId, RIDER_A);
    assert.equal(resumed.session?.participants.find((p) => p.rider_id === RIDER_A)?.progress, "riding");

    const again = await rideProgress!.finishOwnRide(rideId, RIDER_A);
    assert.equal(again.reason, "arrived");
  });

  await t.test("finishing far from the destination is leaving early", async () => {
    const rideId = await createRide(admin, "Left early");
    await rideProgress!.startOwnRide(rideId, RIDER_A);
    await sendFix(rideId, RIDER_A, 4_000, 30);

    const finished = await rideProgress!.finishOwnRide(rideId, RIDER_A);
    assert.equal(finished.reason, "left_early");
  });

  await t.test("a rider parked at the destination is finished automatically, completing the ride", async () => {
    const rideId = await createRide(admin, "Auto finish");
    await liveSession!.startLiveSession(rideId, CAPTAIN);
    await sendFix(rideId, CAPTAIN, 1_000, 90);
    await liveSession!.rollOutLiveSession(rideId, CAPTAIN);
    await sendFix(rideId, CAPTAIN, 60, 30);

    // Not yet: the dwell has not passed.
    const early = await rideProgress!.autoFinishArrivedRiders();
    assert.equal(early.finished, 0);
    assert.equal((await progressOf(admin, rideId, CAPTAIN)).finished_at, null);

    await admin.query(
      `UPDATE ride_live_presence p SET arrived_at = now() - interval '11 minutes'
       FROM ride_live_sessions s
       WHERE s.id = p.session_id AND s.ride_id = $1 AND p.rider_id = $2`,
      [rideId, CAPTAIN],
    );
    const swept = await rideProgress!.autoFinishArrivedRiders();
    assert.equal(swept.finished, 1);
    assert.equal(swept.closedRides, 1, "the only rider out finished, so the ride completes");

    const session = await admin.query(
      `SELECT status, ended_reason FROM ride_live_sessions WHERE ride_id = $1`,
      [rideId],
    );
    assert.deepEqual(session.rows[0], { status: "ended", ended_reason: "all_riders_finished" });
  });

  await t.test("a ride nobody is riding any more ends itself", async () => {
    const rideId = await createRide(admin, "Idle");
    await rideProgress!.startOwnRide(rideId, RIDER_A);
    await sendFix(rideId, RIDER_A, 2_000, 10);

    await admin.query(
      `UPDATE ride_live_sessions SET started_at = now() - interval '3 hours' WHERE ride_id = $1`,
      [rideId],
    );
    await admin.query(
      `UPDATE ride_live_presence p SET last_heartbeat_at = now() - interval '3 hours'
       FROM ride_live_sessions s WHERE s.id = p.session_id AND s.ride_id = $1`,
      [rideId],
    );

    const idle = await rideProgress!.endIdleRides();
    assert.ok(idle.ended >= 1);

    const rideRow = await admin.query(`SELECT status FROM rides WHERE id = $1`, [rideId]);
    assert.equal(rideRow.rows[0].status, "completed", "someone rode it, so it completes");
    assert.equal((await progressOf(admin, rideId, RIDER_A)).finish_reason, "group_ended");
  });
});
