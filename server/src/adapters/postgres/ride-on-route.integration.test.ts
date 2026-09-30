import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";
import { roadViaPoints } from "../../core/routes/roadVia.js";

/**
 * Planning a ride on a saved route: the ride remembers the route, which way
 * round it is ridden, and — when it follows the road — the points that hold
 * Directions to that road. A route the captain cannot see cannot be used.
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
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const CAPTAIN = "cccccccc-0000-0000-0000-0000000000a1";
const OTHER = "aaaaaaaa-0000-0000-0000-0000000000a2";

/** Zig-zags east from Bengaluru: a road with bends worth steering by. */
const ROAD: [number, number][] = Array.from({ length: 9 }, (_, i) => [77.5 + i * 0.05, 12.9 + (i % 2) * 0.01]);

const insertRoute = async (pool: pg.Pool, creatorId: string, visibility: string): Promise<string> => {
  const result = await pool.query(
    `INSERT INTO routes (creator_id, title, geojson, visibility)
     VALUES ($1, 'Zig-zag', $2, $3) RETURNING id`,
    [creatorId, JSON.stringify({ type: "LineString", coordinates: ROAD }), visibility],
  );
  return result.rows[0].id as string;
};

const rideInput = (route?: { route_id: string; direction?: "forward" | "reverse"; follow_road?: boolean }) => ({
  title: "Sunday on the zig-zag",
  visibility: "public" as const,
  status: "scheduled" as const,
  scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
  start_point_coords: ROAD[0]!,
  end_point_coords: ROAD[ROAD.length - 1]!,
  start_point_auto: false,
  ...(route
    ? {
        route: {
          route_id: route.route_id,
          direction: route.direction ?? "forward",
          ...(route.follow_road !== undefined ? { follow_road: route.follow_road } : {}),
        },
      }
    : {}),
});

const storedRoute = async (pool: pg.Pool, rideId: string) => {
  const result = await pool.query(
    `SELECT route_id, route_reversed, road_via FROM rides WHERE id = $1`,
    [rideId],
  );
  return result.rows[0] as { route_id: string | null; route_reversed: boolean; road_via: [number, number][] | null };
};

test("planning a ride on a saved route", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  // Start each run clean. Rides left by earlier runs pile up in the shared
  // list of upcoming rides and push other tests' rides out of it.
  await admin.query(`DELETE FROM rides WHERE captain_id = $1`, [CAPTAIN]);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'onroute-captain@example.test', 'Captain', 'onroutecaptain'),
       ($2, 'onroute-other@example.test', 'Other', 'onrouteother')
     ON CONFLICT (id) DO NOTHING`,
    [CAPTAIN, OTHER],
  );
  const publicRoute = await insertRoute(admin, OTHER, "public");

  await t.test("a route offers its road's points, so a ride can be previewed on it before it exists", async () => {
    const route = await routes!.getRouteById(publicRoute, CAPTAIN);

    assert.deepEqual(route?.road_via, roadViaPoints(ROAD));
  });

  await t.test("a ride that follows the road keeps the road's points in riding order", async () => {
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute }));

    const stored = await storedRoute(admin, ride!.id);
    assert.equal(stored.route_id, publicRoute);
    assert.equal(stored.route_reversed, false);
    assert.deepEqual(stored.road_via, roadViaPoints(ROAD));
    assert.ok(stored.road_via!.length > 0);
  });

  await t.test("ridden the other way round, the ride takes Google's road", async () => {
    // The recorded points lie on the carriageway going the other way; steering
    // through them sends riders on U-turns.
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute, direction: "reverse" }));

    const stored = await storedRoute(admin, ride!.id);
    assert.equal(stored.route_reversed, true);
    assert.equal(stored.road_via, null);
  });

  await t.test("asking to follow the road the other way round is refused, and no ride is made", async () => {
    const before = await admin.query(`SELECT count(*)::int AS n FROM rides WHERE captain_id = $1`, [CAPTAIN]);

    await assert.rejects(
      rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute, direction: "reverse", follow_road: true })),
      rides!.RoadNotFollowableError,
    );

    const after = await admin.query(`SELECT count(*)::int AS n FROM rides WHERE captain_id = $1`, [CAPTAIN]);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  await t.test("a ride that only borrows the route's ends and stops has no road to follow", async () => {
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute, follow_road: false }));

    const stored = await storedRoute(admin, ride!.id);
    assert.equal(stored.route_id, publicRoute);
    assert.equal(stored.road_via, null);
  });

  await t.test("someone else's private route cannot be planned on, and no ride is made", async () => {
    const privateRoute = await insertRoute(admin, OTHER, "private");
    const before = await admin.query(`SELECT count(*)::int AS n FROM rides WHERE captain_id = $1`, [CAPTAIN]);

    await assert.rejects(
      rides!.createRide(CAPTAIN, rideInput({ route_id: privateRoute })),
      rides!.RideRouteUnavailableError,
    );

    const after = await admin.query(`SELECT count(*)::int AS n FROM rides WHERE captain_id = $1`, [CAPTAIN]);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  await t.test("a captain can plan on their own private route", async () => {
    const ownRoute = await insertRoute(admin, CAPTAIN, "private");

    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: ownRoute }));

    assert.equal((await storedRoute(admin, ride!.id)).route_id, ownRoute);
  });

  await t.test("the ride's page says which route it was planned on and its road", async () => {
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute }));

    const read = (await rides!.getRideById(ride!.id, CAPTAIN)) as Record<string, unknown> | null;

    assert.equal(read?.route_id, publicRoute);
    assert.equal(read?.route_title, "Zig-zag");
    assert.deepEqual(read?.road_via, roadViaPoints(ROAD));
  });

  await t.test("the captain can stop following the road, and pick it up again", async () => {
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute }));

    await rides!.updateRideInfo(ride!.id, CAPTAIN, { follow_route_road: false });
    assert.equal((await storedRoute(admin, ride!.id)).road_via, null);

    await rides!.updateRideInfo(ride!.id, CAPTAIN, { follow_route_road: true });
    assert.deepEqual((await storedRoute(admin, ride!.id)).road_via, roadViaPoints(ROAD));
  });

  await t.test("a ride the other way round cannot be switched to follow the road", async () => {
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: publicRoute, direction: "reverse" }));

    await assert.rejects(
      rides!.updateRideInfo(ride!.id, CAPTAIN, { follow_route_road: true }),
      rides!.RoadNotFollowableError,
    );
    assert.equal((await storedRoute(admin, ride!.id)).road_via, null);
  });

  await t.test("a ride not planned on a route has no road to pick up", async () => {
    const ride = await rides!.createRide(CAPTAIN, rideInput());

    await assert.rejects(
      rides!.updateRideInfo(ride!.id, CAPTAIN, { follow_route_road: true }),
      rides!.RideRouteUnavailableError,
    );
  });

  await t.test("deleting the route leaves the ride on its road", async () => {
    const doomed = await insertRoute(admin, CAPTAIN, "public");
    const ride = await rides!.createRide(CAPTAIN, rideInput({ route_id: doomed }));

    await admin.query(`DELETE FROM routes WHERE id = $1`, [doomed]);

    const stored = await storedRoute(admin, ride!.id);
    assert.equal(stored.route_id, null);
    assert.deepEqual(stored.road_via, roadViaPoints(ROAD));
  });
});
