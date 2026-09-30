import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Riders other than its owner see a public route without its first and last
 * ~500 m, unless an end is at a public place; its owner always sees it whole
 * (plans/privacy-defaults.md, step 6). A route too short to show that way
 * can't be made public. Google is never called: the lookups are fakes.
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
const routes = CONNECTION ? await import("../../services/route.service.js") : null;
const view = CONNECTION ? await import("../../services/route-public-view.js") : null;

const OWNER = "7f7f7f7f-0000-0000-0000-0000000000e1";
const OTHER = "7f7f7f7f-0000-0000-0000-0000000000e2";
const RIDERS = [OWNER, OTHER];

/** Far from other tests' routes, so their searches never meet these. */
const BASE = 100;

/** Due east from `lng0` along the equator; 0.01° is about 1.11 km. */
const eastward = (lng0: number, steps: number): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => [Number((lng0 + i * 0.01).toFixed(6)), 0]);

const HOTEL = { name: "Lakeview Hotel", lat: 0.0002, lng: BASE + 5.0001 };

/** A hotel at the start of the routes beginning at BASE + 5; area names from the longitude past BASE. */
const lookups = {
  findPublicPlace: async (point: { lat: number; lng: number }) =>
    Math.abs(point.lng - (BASE + 5)) < 0.001 && Math.abs(point.lat) < 0.001 ? HOTEL : null,
  nameArea: async (point: { lat: number; lng: number }) => `Area ${(point.lng - BASE).toFixed(2)}, Somewhere`,
};

/** Metres between two points on the equator. */
const metresEast = (fromLng: number, toLng: number) => Math.abs(toLng - fromLng) * 111_320;

test("others see a public route without its personal ends", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1::uuid[])`, [RIDERS]);
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'zones-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'zones' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1::uuid[])`, [RIDERS]);

  /** A route of OWNER's along `line`, saved from home. */
  const route = async (line: [number, number][], visibility = "private"): Promise<string> =>
    (
      await admin.query(
        `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name, distance_km,
                             start_point, end_point)
         VALUES ($1, 'Coffee run', $2, $3, '12 Lake Road', 'Hill Top', 10,
                 ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography,
                 ST_SetSRID(ST_MakePoint($6::float8, $7::float8), 4326)::geography)
         RETURNING id`,
        [OWNER, JSON.stringify({ type: "LineString", coordinates: line }), visibility, ...line[0]!, ...line.at(-1)!],
      )
    ).rows[0].id as string;
  const stop = (routeId: string, position: number, lng: number, name: string, note: string | null = null) =>
    admin.query(
      `INSERT INTO route_stops (route_id, position, name, location, note, distance_from_start_km)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4::float8, 0), 4326)::geography, $5, $6)`,
      [routeId, position, name, lng, note, Math.round(metresEast(BASE, lng) / 10) / 100],
    );
  const startLngOf = (seen: { geojson: unknown }) => (seen.geojson as { coordinates: number[][] }).coordinates[0]![0]!;

  await t.test("the owner sees it whole; others see it ~500 m in from each end", async () => {
    const id = await route(eastward(BASE, 9)); // ~10.02 km
    await stop(id, 1, BASE + 0.002, "Rahul's gate", "by the blue door");
    await stop(id, 2, BASE + 0.05, "Chai stall", "best at 6");
    await routes!.setRouteVisibility(id, OWNER, "public", lookups);

    const mine = (await routes!.getRouteById(id, OWNER))!;
    assert.equal(startLngOf(mine), BASE);
    assert.equal(mine.start_name, "12 Lake Road");
    assert.deepEqual(
      mine.stops.map((s) => s.name),
      ["Rahul's gate", "Chai stall"],
    );

    const theirs = (await routes!.getRouteById(id, OTHER))!;
    assert.ok(Math.abs(metresEast(BASE, startLngOf(theirs)) - 500) < 2);
    assert.equal(theirs.start_name, "Area 0.00, Somewhere");
    assert.ok(Math.abs(Number(theirs.distance_km) - 9.02) < 0.05, `distance ${theirs.distance_km}`);
    // The stop by the door is hidden; the one on the way keeps its words, renumbered from the new start.
    assert.deepEqual(
      theirs.stops.map((s) => [s.position, s.name, s.note]),
      [[1, "Chai stall", "best at 6"]],
    );
    assert.ok(Math.abs(Number(theirs.stops[0]!.distance_from_start_km) - (metresEast(BASE, BASE + 0.05) - 500) / 1000) < 0.02);
    // A ride planned on it follows only the part they see.
    assert.ok(theirs.road_via.every(([lng]) => lng > startLngOf(theirs) - 1e-9));

    const listed = (await routes!.listVisibleRoutes(OTHER)).find((r) => r.id === id)!;
    assert.deepEqual(listed.via, ["Chai stall"]);
    assert.equal(listed.start_lng, startLngOf(theirs));
  });

  await t.test("an end at a public place is shown there, named after it", async () => {
    const id = await route(eastward(BASE + 5, 9));
    await routes!.setRouteVisibility(id, OWNER, "public", lookups);

    const theirs = (await routes!.getRouteById(id, OTHER))!;
    assert.equal(theirs.start_name, "Lakeview Hotel");
    assert.equal(Number(theirs.start_lat), HOTEL.lat);
    assert.equal(Number(theirs.start_lng), HOTEL.lng);
    assert.equal(theirs.end_name, "Area 5.09, Somewhere");
  });

  await t.test("a route too short to show without its ends can't be made public", async () => {
    const id = await route(eastward(BASE + 10, 4)); // ~4.5 km: under 5 km left once trimmed
    await assert.rejects(routes!.setRouteVisibility(id, OWNER, "public", lookups), view!.RouteTooShortError);
    const { visibility } = (await admin.query(`SELECT visibility FROM routes WHERE id = $1`, [id])).rows[0];
    assert.equal(visibility, "private");
    assert.equal(await routes!.getRouteById(id, OTHER), null);
  });

  await t.test("a route made public before this is trimmed at both ends for others", async () => {
    const id = await route(eastward(BASE + 20, 9), "public"); // no public_ends: never looked at
    const theirs = (await routes!.getRouteById(id, OTHER))!;
    assert.ok(Math.abs(metresEast(BASE + 20, startLngOf(theirs)) - 500) < 2);
    assert.equal(theirs.start_name, null);
    assert.equal(theirs.end_name, null);
  });

  await t.test("a legacy public route too short to show is hidden from others", async () => {
    const id = await route(eastward(BASE + 30, 3), "public");
    assert.equal(await routes!.getRouteById(id, OTHER), null);
    assert.equal((await routes!.listVisibleRoutes(OTHER)).some((r) => r.id === id), false);
    assert.notEqual(await routes!.getRouteById(id, OWNER), null);
  });

  await t.test("search measures to the start others see", async () => {
    const id = await route(eastward(BASE + 40, 9));
    await routes!.setRouteVisibility(id, OWNER, "public", lookups);
    const results = await routes!.searchRoutes(OTHER, {
      from: { lat: 0, lng: BASE + 40, name: null },
      to: null,
      minKm: null,
      maxKm: null,
      highlights: [],
    });
    const found = results.find((r) => r.id === id)!;
    assert.ok(Math.abs(found.match.start_gap_km! - 0.5) < 0.1, `gap ${found.match.start_gap_km}`);
  });

  await t.test("made private, its ends are forgotten; made public again, looked at again", async () => {
    const id = await route(eastward(BASE + 50, 9));
    await routes!.setRouteVisibility(id, OWNER, "public", lookups);
    await routes!.setRouteVisibility(id, OWNER, "private", lookups);
    const cleared = (await admin.query(`SELECT public_ends FROM routes WHERE id = $1`, [id])).rows[0].public_ends;
    assert.equal(cleared, null);

    await routes!.setRouteVisibility(id, OWNER, "public", lookups);
    const stored = (await admin.query(`SELECT public_ends FROM routes WHERE id = $1`, [id])).rows[0].public_ends;
    assert.equal(stored.startName, "Area 50.00, Somewhere");
  });
});
