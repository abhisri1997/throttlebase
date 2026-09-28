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

/** Names the ends without Google: whichever end is further north is "north". */
const fakeNameArea = async (point: { lat: number; lng: number }) =>
  point.lat > START.lat + 0.01 ? "North End, Testville" : "South Gate, Testville";

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

/**
 * Ride north 100 fixes, park, walk ~300 m east to a building and back over
 * ~10 minutes, then ride on north: the Infosys ride, in miniature.
 */
const recordRideWithWalkOff = async (pool: pg.Pool, sessionId: string, riderId: string) => {
  const walkStepDeg = 0.00018; // ~20 m of longitude
  const parkedLat = START.lat + 99 * STEP_DEG;
  const fixes = [
    ...Array.from({ length: 100 }, (_, i) => ({ lng: START.lon, lat: START.lat + i * STEP_DEG, s: i, acc: 5 })),
    ...Array.from({ length: 30 }, (_, i) => ({
      lng: START.lon + (i < 15 ? i + 1 : 30 - i - 1) * walkStepDeg,
      lat: parkedLat,
      s: 99 + (i + 1) * 20,
      acc: 20,
    })),
    ...Array.from({ length: 100 }, (_, i) => ({ lng: START.lon, lat: parkedLat + (i + 1) * STEP_DEG, s: 719 + i, acc: 5 })),
  ];
  await pool.query(
    `INSERT INTO ride_live_location_samples (session_id, rider_id, location, accuracy_m, captured_at)
     SELECT $1, $2, ST_SetSRID(ST_MakePoint(f.lng, f.lat), 4326)::geography, f.acc,
            now() - interval '1 hour' + f.s * interval '1 second'
     FROM UNNEST($3::float8[], $4::float8[], $5::int[], $6::float8[]) AS f(lng, lat, s, acc)`,
    [sessionId, riderId, fixes.map((f) => f.lng), fixes.map((f) => f.lat), fixes.map((f) => f.s), fixes.map((f) => f.acc)],
  );
  return { parked: { lat: parkedLat, lng: START.lon }, building: { lat: parkedLat, lng: START.lon + 15 * walkStepDeg } };
};

const metresBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

const addStop = async (pool: pg.Pool, rideId: string, sequence: number, name: string, lat: number, lng = START.lon) => {
  const result = await pool.query(
    `INSERT INTO ride_stops (ride_id, type, status, sequence, name, location)
     VALUES ($1, 'rest', 'approved', $2, $3, ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography)
     RETURNING id`,
    [rideId, sequence, name, lng, lat],
  );
  return result.rows[0].id as string;
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

  await t.test("a saved route knows its ends, stops, highlights and ride time", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);
    // One stop on the way, one planned but never ridden past (~5 km east).
    const cafe = await addStop(admin, rideId, 1, "Hill Cafe", START.lat + 100 * STEP_DEG);
    await addStop(admin, rideId, 2, "Detour Dhaba", START.lat + 150 * STEP_DEG, START.lon + 0.05);

    const saved = await routeFromRide!.saveRouteFromRide(
      rideId,
      RIDER,
      {
        title: "Testville run",
        visibility: "public",
        highlights: ["scenic_road", "great_stops"],
        stop_notes: [{ ride_stop_id: cafe, note: "  Opens at 6  " }],
      },
      { nameArea: fakeNameArea },
    );

    assert.equal(saved.route.start_name, "South Gate, Testville");
    assert.equal(saved.route.end_name, "North End, Testville");
    assert.ok(Math.abs(Number(saved.route.start_lat) - START.lat) < 1e-6);
    assert.deepEqual(saved.route.highlights, ["scenic_road", "great_stops"]);
    assert.equal(saved.route.ridden_duration_s, 199);
    assert.deepEqual(saved.route.via, ["Hill Cafe"]);

    const detail = await routes!.getRouteById(saved.route.id, OUTSIDER);
    assert.ok(detail);
    assert.equal(detail.stops.length, 1);
    assert.equal(detail.stops[0]!.name, "Hill Cafe");
    assert.equal(detail.stops[0]!.note, "Opens at 6");
    assert.ok(Math.abs(Number(detail.stops[0]!.distance_from_start_km) - 1.11) < 0.03);

    const listed = (await routes!.listVisibleRoutes(OUTSIDER)).find((route) => route.id === saved.route.id);
    assert.deepEqual(listed?.via, ["Hill Cafe"]);
    assert.equal(listed?.end_name, "North End, Testville");
  });

  await t.test("a route still saves when its ends cannot be named", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);

    const saved = await routeFromRide!.saveRouteFromRide(
      rideId,
      RIDER,
      { title: "Unnamed ends", visibility: "private", highlights: [], stop_notes: [] },
      {
        nameArea: async () => {
          throw new Error("maps quota");
        },
      },
    );

    assert.equal(saved.created, true);
    assert.equal(saved.route.start_name, null);
    assert.equal(saved.route.end_name, null);
  });

  await t.test("a preview shows the names and ridden stops without saving anything", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);
    const cafe = await addStop(admin, rideId, 1, "Hill Cafe", START.lat + 100 * STEP_DEG);
    await addStop(admin, rideId, 2, "Detour Dhaba", START.lat + 150 * STEP_DEG, START.lon + 0.05);
    const routesBefore = await admin.query(`SELECT count(*)::int AS n FROM routes WHERE ride_id = $1`, [rideId]);

    const preview = await routeFromRide!.previewRouteFromRide(rideId, RIDER, { nameArea: fakeNameArea });

    assert.equal(preview.saved_route_id, null);
    assert.equal(preview.start_name, "South Gate, Testville");
    assert.equal(preview.end_name, "North End, Testville");
    assert.ok(Math.abs(preview.distance_km - 2.21) < 0.03);
    assert.equal(preview.duration_s, 199);
    assert.deepEqual(
      preview.stops.map((stop) => [stop.ride_stop_id, stop.name]),
      [[cafe, "Hill Cafe"]],
    );
    const routesAfter = await admin.query(`SELECT count(*)::int AS n FROM routes WHERE ride_id = $1`, [rideId]);
    assert.equal(routesAfter.rows[0].n, routesBefore.rows[0].n);
  });

  await t.test("a preview of a ride already saved points at that route", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    await recordRide(admin, sessionId, RIDER, 200);
    const saved = await routeFromRide!.saveRouteFromRide(rideId, RIDER, { title: "Once", visibility: "private" });

    const preview = await routeFromRide!.previewRouteFromRide(rideId, RIDER, { nameArea: fakeNameArea });

    assert.equal(preview.saved_route_id, saved.route.id);
  });

  await t.test("a ride still in progress cannot be previewed either", async () => {
    const { rideId, sessionId } = await createRide(admin, "active");
    await recordRide(admin, sessionId, RIDER, 200);

    await rejectsWith(routeFromRide!.previewRouteFromRide(rideId, RIDER, { nameArea: fakeNameArea }), 409);
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

  await t.test("walking off at a stop is left out of the route, and the stop sits where the bike was", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    const { parked, building } = await recordRideWithWalkOff(admin, sessionId, RIDER);
    await addStop(admin, rideId, 1, "Building 37", building.lat, building.lng);

    const saved = await routeFromRide!.saveRouteFromRide(rideId, RIDER, { title: "Office run", visibility: "public" });

    assert.ok(Math.abs(Number(saved.route.distance_km) - 2.21) < 0.05, `rode ${saved.route.distance_km} km`);
    assert.ok(Math.abs(Number(saved.route.ridden_duration_s) - 198) < 5, `rode ${saved.route.ridden_duration_s} s`);
    const detail = await routes!.getRouteById(saved.route.id, RIDER);
    assert.equal(detail?.stops[0]?.name, "Building 37");
    assert.ok(metresBetween(detail!.stops[0]!, parked) < 25, "the stop is where the bike was parked");
    assert.ok(metresBetween(detail!.stops[0]!, building) > 250, "not the building the rider walked to");
  });

  await t.test("a route saved before stops were understood is rebuilt from its ride, keeping names and notes", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    const { parked, building } = await recordRideWithWalkOff(admin, sessionId, RIDER);
    await addStop(admin, rideId, 1, "Building 37", building.lat, building.lng);
    // As the old save wrote it: the walk in the line, time first fix to last, the stop at the building.
    const old = await admin.query(
      `INSERT INTO routes (creator_id, ride_id, title, geojson, distance_km, visibility,
                           start_name, end_name, ridden_duration_s)
       VALUES ($1, $2, 'Old save', $3, 2.8, 'public', 'Named Start', 'Named End', 818)
       RETURNING id`,
      [RIDER, rideId, JSON.stringify({ type: "LineString", coordinates: [[START.lon, START.lat], [building.lng, building.lat], [START.lon, START.lat + 0.02]] })],
    );
    const routeId = old.rows[0].id as string;
    await admin.query(
      `INSERT INTO route_stops (route_id, position, name, location, note)
       VALUES ($1, 1, 'Building 37', ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography, 'Park at the gate')`,
      [routeId, building.lng, building.lat],
    );

    const rebuilt = await routeFromRide!.rebuildRouteFromRide(routeId);

    assert.ok(rebuilt);
    assert.equal(rebuilt.before.durationS, 818);
    assert.ok(Math.abs(rebuilt.after.durationS - 198) < 5);
    const detail = await routes!.getRouteById(routeId, RIDER);
    assert.equal(detail?.start_name, "Named Start");
    assert.equal(detail?.end_name, "Named End");
    assert.ok(Math.abs(Number(detail?.distance_km) - 2.21) < 0.05);
    assert.equal(detail?.stops[0]?.note, "Park at the gate");
    assert.ok(metresBetween(detail!.stops[0]!, parked) < 25);
    assert.ok(detail!.geojson && (detail!.geojson as { coordinates: number[][] }).coordinates.every(([lng]) => lng! < START.lon + 0.0002));
  });

  await t.test("a route with no ride of its own is left alone", async () => {
    const drawn = await admin.query(
      `INSERT INTO routes (creator_id, title, geojson, visibility) VALUES ($1, 'Drawn', $2, 'public') RETURNING id`,
      [RIDER, JSON.stringify({ type: "LineString", coordinates: [[77.6, 12.9], [77.6, 12.95]] })],
    );

    assert.equal(await routeFromRide!.rebuildRouteFromRide(drawn.rows[0].id as string), null);
  });

  await t.test("the save sheet offers a stop the rider found, and the route keeps it under the rider's name", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    const { parked } = await recordRideWithWalkOff(admin, sessionId, RIDER);

    const preview = await routeFromRide!.previewRouteFromRide(rideId, RIDER, { nameArea: fakeNameArea });
    const found = preview.stop_choices.find((choice) => choice.kind === "discovered");
    assert.ok(found, "the walk-off is offered as a stop");
    assert.equal(found.status, "found");
    assert.equal(found.suggested, true, "ticked: the rider walked off");
    assert.equal(found.walked_away, true);
    assert.equal(found.name, "South Gate, Testville", "named by its area");
    assert.ok(found.stopped_s! > 500);
    assert.deepEqual(preview.stops, [], "the older list keeps to planned stops");

    const saved = await routeFromRide!.saveRouteFromRide(
      rideId,
      RIDER,
      {
        title: "Found it",
        visibility: "public",
        stops: [{ key: found.key, name: "Campus cafe", note: "Chai at the gate" }],
      },
      { nameArea: fakeNameArea },
    );

    const detail = await routes!.getRouteById(saved.route.id, RIDER);
    assert.deepEqual(detail?.stops.map((stop) => [stop.name, stop.note]), [["Campus cafe", "Chai at the gate"]]);
    assert.ok(metresBetween(detail!.stops[0]!, parked) < 25, "where the bike was");
  });

  await t.test("a stop the rider leaves unticked is not on the route, planned or found", async () => {
    const { rideId, sessionId } = await createRide(admin, "completed");
    const { building } = await recordRideWithWalkOff(admin, sessionId, RIDER);
    await addStop(admin, rideId, 1, "Building 37", building.lat, building.lng);

    const saved = await routeFromRide!.saveRouteFromRide(rideId, RIDER, {
      title: "No stops",
      visibility: "public",
      stops: [],
    });

    const detail = await routes!.getRouteById(saved.route.id, RIDER);
    assert.deepEqual(detail?.stops, []);
  });
});
