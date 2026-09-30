import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Recording no longer needs live sharing (docs/ride-now-ux.md §7.3): a rider
 * who records without sharing keeps their track, and nobody else learns
 * where they are. The replay, which any rider on the ride can read, returns
 * only the caller's own samples (D2: another rider's exact line is theirs).
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

const CAPTAIN = "e0e0e0e0-0000-4000-8000-000000000001";
const PRIVATE = "e0e0e0e0-0000-4000-8000-000000000002";

const HOME = { lon: 77.62, lat: 12.93 };
const DEST = { lon: 77.62, lat: 13.03 };
const north = (metres: number) => HOME.lat + metres / 111_320;
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const fix = (rideId: string, riderId: string, metresNorth: number, ageSeconds: number, share: boolean) =>
  liveSession!.updateLivePresenceLocation(
    rideId,
    riderId,
    { lon: HOME.lon, lat: north(metresNorth), accuracy_m: 8, captured_at: secondsAgo(ageSeconds) },
    { persistSample: true, share },
  );

test("recording without sharing", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'rws-captain@example.test', 'Captain', 'rwscaptain'),
       ($2, 'rws-private@example.test', 'Private', 'rwsprivate')
     ON CONFLICT (id) DO NOTHING`,
    [CAPTAIN, PRIVATE],
  );
  const ride = await admin.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, start_point, end_point)
     VALUES ($1, 'Record without sharing', 'scheduled', 'public', now(),
             ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
             ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
     RETURNING id`,
    [CAPTAIN, HOME.lon, HOME.lat, DEST.lon, DEST.lat],
  );
  const rideId = ride.rows[0].id as string;
  await admin.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now()),
       ($1, $3, 'rider', 'confirmed', now())`,
    [rideId, CAPTAIN, PRIVATE],
  );
  await liveSession!.startLiveSession(rideId, CAPTAIN);
  await liveSession!.rollOutLiveSession(rideId, CAPTAIN);
  const session = await admin.query(`SELECT id FROM ride_live_sessions WHERE ride_id = $1`, [rideId]);
  await admin.query(`UPDATE ride_live_presence SET ride_started_at = now() - interval '5 minutes' WHERE session_id = $1`, [
    session.rows[0].id,
  ]);

  await fix(rideId, CAPTAIN, 0, 40, true);
  await fix(rideId, CAPTAIN, 500, 30, true);
  await fix(rideId, PRIVATE, 0, 40, false);
  await fix(rideId, PRIVATE, 800, 30, false);

  await t.test("the unshared position isn't kept where others can read it", async () => {
    const state = await liveSession!.getLiveSessionWithParticipants(rideId);
    const participants = (state?.participants ?? []) as Array<{ rider_id: string; distance_to_destination_m: number | null }>;
    const captain = participants.find((p) => p.rider_id === CAPTAIN);
    const hidden = participants.find((p) => p.rider_id === PRIVATE);
    assert.ok(captain?.distance_to_destination_m != null, "a sharing rider's distance is known");
    assert.equal(hidden?.distance_to_destination_m, null, "nobody can tell how far the private rider is");
  });

  await t.test("it is still recorded in the rider's own track", async () => {
    const samples = await admin.query(
      `SELECT count(*)::int AS n FROM ride_live_location_samples WHERE session_id = $1 AND rider_id = $2`,
      [session.rows[0].id, PRIVATE],
    );
    assert.equal(samples.rows[0].n, 2);
  });

  await t.test("the replay gives each rider only their own samples", async () => {
    const mine = await liveSession!.getLiveSessionReplay(rideId, CAPTAIN);
    assert.ok(mine.samples.length >= 2);
    assert.ok(mine.samples.every((s) => s.rider_id === CAPTAIN));

    const theirs = await liveSession!.getLiveSessionReplay(rideId, PRIVATE);
    assert.ok(theirs.samples.every((s) => s.rider_id === PRIVATE));
  });
});
