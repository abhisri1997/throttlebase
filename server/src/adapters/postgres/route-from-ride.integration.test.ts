import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Saving a finished ride as a route, against a real Postgres + PostGIS: the
 * route is built from the rider's own recorded fixes, only once the ride is
 * completed, only for participants, and only once per rider and ride.
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
const routeFromRide = CONNECTION ? await import("../../services/route-from-ride.service.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const CAPTAIN = "cccccccc-0000-0000-0000-0000000000c1";
const RIDER = "aaaaaaaa-0000-0000-0000-0000000000a1";
const QUIET_RIDER = "bbbbbbbb-0000-0000-0000-0000000000b1";
const OUTSIDER = "dddddddd-0000-0000-0000-0000000000d1";

/** ~11 m of latitude; 200 fixes make a ~2.2 km ride due north. */
const STEP_DEG = 0.0001;
const START = { lon: 77.6, lat: 12.9 };

const createRide = async (pool: pg.Pool, status: string): Promise<{ rideId: string; sessionId: string }> => {
  const ride = await pool.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, start_point, end_point)
     VALUES ($1, 'Morning loop', $2, 'public', now() - interval '2 hours',
             ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326)::geography,
             ST_SetSRID(ST_MakePoint(77.6, 12.92), 4326)::geography)
     RETURNING id`,
    [CAPTAIN, status],
  );
  const rideId = ride.rows[0].id as string;
  await pool.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now()),
       ($1, $3, 'rider', 'confirmed', now()),
       ($1, $4, 'rider', 'confirmed', now())`,
    [rideId, CAPTAIN, RIDER, QUIET_RIDER],
  );
  const session = await pool.query(
    `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at)
     VALUES ($1, 'active', $2, now() - interval '1 hour')
     RETURNING id`,
    [rideId, CAPTAIN],
  );
  return { rideId, sessionId: session.rows[0].id as string };
};

/** A straight ride north of START, one fix a second. */
const recordRide = async (pool: pg.Pool, sessionId: string, riderId: string, fixes: number) => {
  await pool.query(
    `INSERT INTO ride_live_location_samples (session_id, rider_id, location, accuracy_m, captured_at)
     SELECT $1, $2,
            ST_SetSRID(ST_MakePoint($3::float8, $4::float8 + i * $5::float8), 4326)::geography,
            5,
            now() - interval '1 hour' + i * interval '1 second'
     FROM generate_series(0, $6 - 1) AS i`,
    [sessionId, riderId, START.lon, START.lat, STEP_DEG, fixes],
  );
};

const rejectsWith = async (promise: Promise<unknown>, statusCode: number) => {
  await assert.rejects(promise, (error: { statusCode?: number }) => error.statusCode === statusCode);
};

test("saving a finished ride as a route", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'rc@example.test', 'Captain', 'routecaptain'),
       ($2, 'rr@example.test', 'Rider', 'routerider'),
       ($3, 'rq@example.test', 'Quiet', 'routequiet'),
       ($4, 'ro@example.test', 'Outsider', 'routeoutsider')
     ON CONFLICT (id) DO NOTHING`,
    [CAPTAIN, RIDER, QUIET_RIDER, OUTSIDER],
  );

  await t.test("a ride still in progress cannot be saved yet", async () => {
    const { rideId, sessionId } = await createRide(admin, "active");
    await recordRide(admin, sessionId, RIDER, 200);

    await rejectsWith(
      routeFromRide!.saveRouteFromRide(rideId, RIDER, { title: "Too soon", visibility: "public" }),
      409,
    );
  });

  await t.test("someone who was not on the ride cannot save it", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);

    await rejectsWith(
      routeFromRide!.saveRouteFromRide(rideId, OUTSIDER, { title: "Not mine", visibility: "public" }),
      403,
    );
  });

  await t.test("the rider's own track becomes a public route, once", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);

    const first = await routeFromRide!.saveRouteFromRide(rideId, RIDER, {
      title: "Morning loop",
      visibility: "public",
    });

    assert.equal(first.created, true);
    assert.equal(first.route.creator_id, RIDER);
    assert.equal(first.route.ride_id, rideId);
    assert.equal(first.route.visibility, "public");
    assert.ok(Math.abs(Number(first.route.distance_km) - 2.21) < 0.03, `distance ${first.route.distance_km}`);
    const geojson = first.route.geojson as { type: string; coordinates: number[][] };
    assert.equal(geojson.type, "LineString");
    // A straight ride simplifies to its two ends, longitude first.
    assert.equal(geojson.coordinates.length, 2);
    assert.ok(Math.abs(geojson.coordinates[0]![0]! - START.lon) < 1e-6);
    assert.ok(Math.abs(geojson.coordinates[0]![1]! - START.lat) < 1e-6);

    const listed = await routes!.listVisibleRoutes(OUTSIDER);
    assert.ok(listed.some((route) => route.id === first.route.id));

    const again = await routeFromRide!.saveRouteFromRide(rideId, RIDER, {
      title: "Morning loop, again",
      visibility: "public",
    });
    assert.equal(again.created, false);
    assert.equal(again.route.id, first.route.id);
  });

  await t.test("a participant with nothing recorded gets no route", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);

    await rejectsWith(
      routeFromRide!.saveRouteFromRide(rideId, QUIET_RIDER, { title: "Nothing", visibility: "public" }),
      422,
    );
  });

  await t.test("a private route is listed for its creator and nobody else", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);

    const saved = await routeFromRide!.saveRouteFromRide(rideId, RIDER, {
      title: "Secret loop",
      visibility: "private",
    });

    assert.equal(saved.route.visibility, "private");
    const forOthers = await routes!.listVisibleRoutes(OUTSIDER);
    assert.ok(!forOthers.some((route) => route.id === saved.route.id));
    const forCreator = await routes!.listVisibleRoutes(RIDER);
    assert.ok(forCreator.some((route) => route.id === saved.route.id));
  });
});
