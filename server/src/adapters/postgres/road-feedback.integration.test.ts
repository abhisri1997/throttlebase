import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * "Was the road as described?" is asked of the riders on a finished ride that
 * followed a saved route's road, and what they say is summed up on the route.
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
const feedback = CONNECTION ? await import("../../services/road-feedback.service.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const CAPTAIN = "cccccccc-0000-0000-0000-0000000000e1";
const RIDER = "aaaaaaaa-0000-0000-0000-0000000000e2";
const SECOND_RIDER = "bbbbbbbb-0000-0000-0000-0000000000e3";
const OUTSIDER = "dddddddd-0000-0000-0000-0000000000e4";
const MISSING_RIDE = "eeeeeeee-0000-0000-0000-0000000000e5";

const ROAD = [
  [77.5, 12.9],
  [77.55, 12.91],
  [77.6, 12.9],
];

const insertRoute = async (pool: pg.Pool): Promise<string> => {
  const result = await pool.query(
    `INSERT INTO routes (creator_id, title, geojson, visibility) VALUES ($1, 'Lake loop', $2, 'public') RETURNING id`,
    [CAPTAIN, JSON.stringify({ type: "LineString", coordinates: ROAD })],
  );
  return result.rows[0].id as string;
};

const insertRide = async (
  pool: pg.Pool,
  routeId: string,
  { status = "completed", followedRoad = true }: { status?: string; followedRoad?: boolean } = {},
): Promise<string> => {
  const ride = await pool.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, route_id, road_via)
     VALUES ($1, 'Sunday loop', $2, 'public', now() - interval '1 day', $3, $4)
     RETURNING id`,
    [CAPTAIN, status, routeId, followedRoad ? JSON.stringify([[77.55, 12.91]]) : null],
  );
  const rideId = ride.rows[0].id as string;
  await pool.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now()),
       ($1, $3, 'rider', 'confirmed', now()),
       ($1, $4, 'rider', 'confirmed', now())`,
    [rideId, CAPTAIN, RIDER, SECOND_RIDER],
  );
  return rideId;
};

test("was the road as described?", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'rf-captain@example.test', 'Captain', 'rfcaptain'),
       ($2, 'rf-rider@example.test', 'Rider', 'rfrider'),
       ($3, 'rf-second@example.test', 'Second', 'rfsecond'),
       ($4, 'rf-outsider@example.test', 'Outsider', 'rfoutsider')
     ON CONFLICT (id) DO NOTHING`,
    [CAPTAIN, RIDER, SECOND_RIDER, OUTSIDER],
  );

  await t.test("a rider on a finished ride that followed the road is asked, and their answer is kept", async () => {
    const routeId = await insertRoute(admin);
    const rideId = await insertRide(admin, routeId);

    const before = await feedback!.getRoadFeedbackPrompt(rideId, RIDER);
    assert.deepEqual(before, { can_answer: true, route_id: routeId, route_title: "Lake loop", feedback: null });

    await feedback!.saveRoadFeedback(rideId, RIDER, {
      as_described: false,
      reasons: ["heavy_traffic"],
      note: "Busy at the lake gate",
    });

    const after = await feedback!.getRoadFeedbackPrompt(rideId, RIDER);
    assert.deepEqual(after?.feedback, {
      as_described: false,
      reasons: ["heavy_traffic"],
      note: "Busy at the lake gate",
    });
  });

  await t.test("a rider can change their answer, which replaces it", async () => {
    const routeId = await insertRoute(admin);
    const rideId = await insertRide(admin, routeId);

    await feedback!.saveRoadFeedback(rideId, RIDER, { as_described: false, reasons: ["road_works"], note: null });
    await feedback!.saveRoadFeedback(rideId, RIDER, { as_described: true, reasons: [], note: null });

    const summary = await feedback!.getRouteRoadFeedback(routeId);
    assert.deepEqual(summary, { described: 1, total: 1, reasons: [] });
  });

  await t.test("someone who wasn't on the ride is not asked and cannot answer", async () => {
    const routeId = await insertRoute(admin);
    const rideId = await insertRide(admin, routeId);

    assert.equal((await feedback!.getRoadFeedbackPrompt(rideId, OUTSIDER))?.can_answer, false);
    await assert.rejects(
      feedback!.saveRoadFeedback(rideId, OUTSIDER, { as_described: true, reasons: [], note: null }),
      (error: unknown) => error instanceof feedback!.RoadFeedbackNotAllowedError && error.kind === "not_a_rider",
    );
  });

  await t.test("a ride that took Google's road instead is not asked about the route's road", async () => {
    const routeId = await insertRoute(admin);
    const rideId = await insertRide(admin, routeId, { followedRoad: false });

    assert.equal((await feedback!.getRoadFeedbackPrompt(rideId, RIDER))?.can_answer, false);
    await assert.rejects(
      feedback!.saveRoadFeedback(rideId, RIDER, { as_described: true, reasons: [], note: null }),
      (error: unknown) => error instanceof feedback!.RoadFeedbackNotAllowedError && error.kind === "no_road",
    );
  });

  await t.test("a ride that hasn't finished is not asked yet", async () => {
    const routeId = await insertRoute(admin);
    const rideId = await insertRide(admin, routeId, { status: "active" });

    assert.equal((await feedback!.getRoadFeedbackPrompt(rideId, RIDER))?.can_answer, false);
    await assert.rejects(
      feedback!.saveRoadFeedback(rideId, RIDER, { as_described: true, reasons: [], note: null }),
      (error: unknown) => error instanceof feedback!.RoadFeedbackNotAllowedError && error.kind === "not_finished",
    );
  });

  await t.test("a ride that doesn't exist has nothing to ask", async () => {
    assert.equal(await feedback!.getRoadFeedbackPrompt(MISSING_RIDE, RIDER), null);
    await assert.rejects(
      feedback!.saveRoadFeedback(MISSING_RIDE, RIDER, { as_described: true, reasons: [], note: null }),
      (error: unknown) => error instanceof feedback!.RoadFeedbackNotAllowedError && error.kind === "not_found",
    );
  });

  await t.test("the route sums up every ride on its road: how many said yes, and what was different", async () => {
    const routeId = await insertRoute(admin);
    const firstRide = await insertRide(admin, routeId);
    const secondRide = await insertRide(admin, routeId);

    await feedback!.saveRoadFeedback(firstRide, CAPTAIN, { as_described: true, reasons: [], note: null });
    await feedback!.saveRoadFeedback(firstRide, RIDER, {
      as_described: false,
      reasons: ["heavy_traffic", "rough_surface"],
      note: null,
    });
    await feedback!.saveRoadFeedback(secondRide, RIDER, { as_described: false, reasons: ["heavy_traffic"], note: null });
    await feedback!.saveRoadFeedback(secondRide, SECOND_RIDER, { as_described: true, reasons: [], note: null });

    const expected = {
      described: 2,
      total: 4,
      reasons: [
        { reason: "heavy_traffic", count: 2 },
        { reason: "rough_surface", count: 1 },
      ],
    };
    assert.deepEqual(await feedback!.getRouteRoadFeedback(routeId), expected);
    assert.deepEqual((await routes!.getRouteById(routeId, OUTSIDER))?.road_feedback, expected);
  });

  await t.test("a route nobody has answered for says nothing yet", async () => {
    const routeId = await insertRoute(admin);

    assert.deepEqual(await feedback!.getRouteRoadFeedback(routeId), { described: 0, total: 0, reasons: [] });
  });
});
