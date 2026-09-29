import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * At purge, a deleted rider's public routes are kept for the community,
 * anonymised; the rest of their routes are deleted (plans/account-deletion.md,
 * decision B). Google is never called: the lookups are fakes.
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
const purge = CONNECTION ? await import("../../workers/processors/account-purge.processor.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const GONE = "7e7e7e7e-0000-0000-0000-0000000000d1";
const OTHER = "7e7e7e7e-0000-0000-0000-0000000000d2";
const RIDERS = [GONE, OTHER];

/** Due east from `lng0` along the equator; 0.01° is about 1.11 km. */
const eastward = (lng0: number, steps: number): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => [Number((lng0 + i * 0.01).toFixed(6)), 0]);

const HOTEL = { name: "Taj West End", lat: 0.0003, lng: 1.0002 };

/** A hotel at the start of the route that begins at lng 1; area names from the longitude. */
const lookups = {
  findPublicPlace: async (point: { lat: number; lng: number }) =>
    Math.abs(point.lng - 1) < 0.001 && Math.abs(point.lat) < 0.001 ? HOTEL : null,
  nameArea: async (point: { lat: number; lng: number }) => `Area ${point.lng.toFixed(2)}, Somewhere`,
};

test("purging keeps public routes for the community, anonymised", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1::uuid[]) OR title LIKE 'Area %' OR title LIKE 'Taj West End%'`, [
      RIDERS,
    ]);
    await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'community-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'community' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);

  const route = async (title: string, visibility: string, line: [number, number][]): Promise<string> =>
    (
      await admin.query(
        `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name, highlights, ridden_duration_s,
                             start_point, end_point)
         VALUES ($1, $2, $3, $4, '12 Lake Road', 'Nandi Hills', '{scenic_road}', 3600,
                 ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography,
                 ST_SetSRID(ST_MakePoint($7::float8, $8::float8), 4326)::geography)
         RETURNING id`,
        [GONE, title, JSON.stringify({ type: "LineString", coordinates: line }), visibility, ...line[0]!, ...line.at(-1)!],
      )
    ).rows[0].id as string;
  const stop = (routeId: string, position: number, lng: number, note: string) =>
    admin.query(
      `INSERT INTO route_stops (route_id, position, name, location, note)
       VALUES ($1, $2, 'Rahul''s gate', ST_SetSRID(ST_MakePoint($3::float8, 0), 4326)::geography, $4)`,
      [routeId, position, lng, note],
    );

  // A ~10 km public route from the rider's home, with a stop by the door and one on the way.
  const fromHome = await route("From Rahul's place", "public", eastward(0, 9));
  await stop(fromHome, 1, 0.002, "my gate");
  await stop(fromHome, 2, 0.05, "chai here");
  const ride = (
    await admin.query(
      `INSERT INTO rides (captain_id, title, status, scheduled_at) VALUES ($1, 'Old ride', 'completed', now()) RETURNING id`,
      [OTHER],
    )
  ).rows[0].id as string;
  await admin.query(`UPDATE routes SET ride_id = $2 WHERE id = $1`, [fromHome, ride]);
  await admin.query(`INSERT INTO route_bookmarks (route_id, rider_id) VALUES ($1, $2)`, [fromHome, OTHER]);
  await admin.query(`INSERT INTO route_road_feedback (route_id, rider_id, as_described) VALUES ($1, $2, true)`, [fromHome, OTHER]);
  await admin.query(`INSERT INTO route_shares (route_id, shared_with_rider_id) VALUES ($1, $2)`, [fromHome, OTHER]);

  const fromHotel = await route("Weekend from the hotel", "public", eastward(1, 9));
  const tooShort = await route("Round the block", "public", eastward(2, 3));
  const privateOne = await route("My secret road", "private", eastward(3, 9));

  await admin.query(`UPDATE riders SET deleted_at = now() - interval '31 days' WHERE id = $1`, [GONE]);
  const result = await purge!.processAccountPurge({}, lookups);

  const row = async (id: string) =>
    (
      await admin.query(
        `SELECT creator_id, title, start_name, end_name, ridden_duration_s, ride_id, highlights,
                ST_X(start_point::geometry) AS start_lng, ST_Y(start_point::geometry) AS start_lat
           FROM routes WHERE id = $1`,
        [id],
      )
    ).rows[0] as Record<string, unknown> | undefined;

  await t.test("a public route from home loses its rider, its ends and its words", async () => {
    const kept = (await row(fromHome))!;
    assert.equal(kept.creator_id, null);
    assert.equal(kept.title, "Area 0.00 to Area 0.09");
    assert.equal(kept.start_name, "Area 0.00, Somewhere");
    assert.equal(kept.ridden_duration_s, null);
    assert.equal(kept.ride_id, null);
    assert.deepEqual(kept.highlights, ["scenic_road"]);
    // About 500 m in from the old start.
    assert.ok(Math.abs(Number(kept.start_lng) - 0.0045) < 0.0002);

    const stops = await admin.query(`SELECT position, name, note FROM route_stops WHERE route_id = $1 ORDER BY position`, [
      fromHome,
    ]);
    assert.deepEqual(stops.rows, [{ position: 1, name: "Area 0.05, Somewhere", note: null }]);
  });

  await t.test("other riders keep their bookmark and road feedback; shares go", async () => {
    const count = async (table: string) =>
      Number((await admin.query(`SELECT count(*) AS n FROM ${table} WHERE route_id = $1`, [fromHome])).rows[0].n);
    assert.equal(await count("route_bookmarks"), 1);
    assert.equal(await count("route_road_feedback"), 1);
    assert.equal(await count("route_shares"), 0);
  });

  await t.test("an end at a public place stays there, named after it", async () => {
    const kept = (await row(fromHotel))!;
    assert.equal(kept.creator_id, null);
    assert.equal(kept.start_name, "Taj West End");
    assert.equal(kept.title, "Taj West End to Area 1.09");
    assert.equal(Number(kept.start_lng), HOTEL.lng);
    assert.equal(Number(kept.start_lat), HOTEL.lat);
  });

  await t.test("short and private routes are deleted", async () => {
    assert.equal(await row(tooShort), undefined);
    assert.equal(await row(privateOne), undefined);
    assert.ok(Number(result.routesKept) >= 2);
  });

  await t.test("riders find it as a community route that nobody owns", async () => {
    const seen = (await routes!.getRouteById(fromHome, OTHER)) as unknown as Record<string, unknown>;
    assert.equal(seen.creator_id, null);
    assert.equal(seen.creator_name, null);
    assert.ok((await routes!.listVisibleRoutes(OTHER)).some((listed) => listed.id === fromHome));
    assert.equal(await routes!.deleteRoute(fromHome, GONE), false);
  });

  await t.test("purging again changes nothing", async () => {
    const before = await row(fromHome);
    await purge!.processAccountPurge({}, lookups);
    assert.deepEqual(await row(fromHome), before);
  });
});
