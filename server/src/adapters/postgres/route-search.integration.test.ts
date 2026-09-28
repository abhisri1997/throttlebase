import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Route search against a real Postgres + PostGIS: the SQL shortlist (radius
 * and names, visibility) and the ranking together, as the API runs them.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database (see
 * migrations.integration.test.ts for a container recipe).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
if (CONNECTION) {
  process.env.DATABASE_URL = CONNECTION;
}

const db = CONNECTION ? await import("../../config/db.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const SAVER = "a1a1a1a1-0000-0000-0000-00000000005a";
const SEARCHER = "b2b2b2b2-0000-0000-0000-00000000005b";

const BENGALURU = { lat: 12.97, lng: 77.59, name: "Bengaluru, Karnataka, India" };
const WAYANAD = { lat: 11.68, lng: 76.13, name: "Wayanad, Kerala, India" };

interface RouteRow {
  title: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  startName: string;
  endName: string;
  distanceKm: number;
  visibility?: "public" | "private";
  highlights?: string[];
  stops?: string[];
}

const insertRoute = async (pool: pg.Pool, row: RouteRow): Promise<string> => {
  const result = await pool.query(
    `INSERT INTO routes (creator_id, title, geojson, distance_km, visibility, start_name, end_name,
                         start_point, end_point, highlights)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             ST_SetSRID(ST_MakePoint($8::float8, $9::float8), 4326)::geography,
             ST_SetSRID(ST_MakePoint($10::float8, $11::float8), 4326)::geography,
             $12)
     RETURNING id`,
    [
      SAVER,
      row.title,
      JSON.stringify({ type: "LineString", coordinates: [[row.start.lng, row.start.lat], [row.end.lng, row.end.lat]] }),
      row.distanceKm,
      row.visibility ?? "public",
      row.startName,
      row.endName,
      row.start.lng,
      row.start.lat,
      row.end.lng,
      row.end.lat,
      row.highlights ?? [],
    ],
  );
  const routeId = result.rows[0].id as string;
  for (const [index, name] of (row.stops ?? []).entries()) {
    await pool.query(
      `INSERT INTO route_stops (route_id, position, name, location)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(76.6, 12.3), 4326)::geography)`,
      [routeId, index + 1, name],
    );
  }
  return routeId;
};

const noFilters = { minKm: null, maxKm: null, highlights: [] as string[] };

test("searching routes by place", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'saver@example.test', 'Saver', 'routesaver'),
       ($2, 'searcher@example.test', 'Searcher', 'routesearcher')
     ON CONFLICT (id) DO NOTHING`,
    [SAVER, SEARCHER],
  );

  const forward = await insertRoute(admin, {
    title: "Wayanad weekend",
    start: { lat: BENGALURU.lat + 0.07, lng: BENGALURU.lng }, // ~7.8 km north
    end: { lat: 11.66, lng: 76.26 },
    startName: "Yelahanka, Bengaluru",
    endName: "Sulthan Bathery",
    distanceKm: 281,
    highlights: ["scenic_road", "great_stops"],
    stops: ["Mysuru", "Gundlupet"],
  });
  const reverse = await insertRoute(admin, {
    title: "Back from the hills",
    start: { lat: 11.61, lng: 76.08 },
    end: { lat: BENGALURU.lat, lng: BENGALURU.lng + 0.02 },
    startName: "Kalpetta",
    endName: "Jayanagar, Bengaluru",
    distanceKm: 290,
  });
  const cityHop = await insertRoute(admin, {
    title: "Office run",
    start: { lat: 12.84, lng: 77.66 },
    end: { lat: 12.91, lng: 77.64 },
    startName: "Electronic City, Doddathoguru",
    endName: "HSR Layout, Bengaluru",
    distanceKm: 14,
  });
  const secret = await insertRoute(admin, {
    title: "Secret loop",
    start: { lat: BENGALURU.lat, lng: BENGALURU.lng },
    end: { lat: WAYANAD.lat, lng: WAYANAD.lng },
    startName: "Bengaluru",
    endName: "Wayanad",
    distanceKm: 280,
    visibility: "private",
  });

  await t.test("Bengaluru to Wayanad finds both directions, same way first, with gaps", async () => {
    const results = await routes!.searchRoutes(SEARCHER, { from: BENGALURU, to: WAYANAD, ...noFilters });

    assert.deepEqual(
      results.map((route) => [route.id, route.match.direction]),
      [
        [forward, "forward"],
        [reverse, "reverse"],
      ],
    );
    assert.ok(Math.abs(results[0]!.match.start_gap_km! - 7.8) < 0.3, `gap ${results[0]!.match.start_gap_km}`);
    assert.ok(!results.some((route) => route.id === cityHop), "the city hop starts 15 km out: beyond its 5 km radius");
  });

  await t.test("a private route is found only by the rider who saved it", async () => {
    const forSearcher = await routes!.searchRoutes(SEARCHER, { from: BENGALURU, to: WAYANAD, ...noFilters });
    const forSaver = await routes!.searchRoutes(SAVER, { from: BENGALURU, to: WAYANAD, ...noFilters });

    assert.ok(!forSearcher.some((route) => route.id === secret));
    assert.ok(forSaver.some((route) => route.id === secret));
  });

  await t.test("a stop's name finds a route that passes through the place", async () => {
    const results = await routes!.searchRoutes(SEARCHER, {
      from: null,
      to: { lat: 0, lng: 0, name: "Gundlupet, Karnataka" },
      ...noFilters,
    });

    assert.deepEqual(
      results.map((route) => route.id),
      [forward],
    );
  });

  await t.test("highlights narrow the results", async () => {
    const results = await routes!.searchRoutes(SEARCHER, {
      from: BENGALURU,
      to: null,
      minKm: null,
      maxKm: null,
      highlights: ["scenic_road"],
    });

    assert.deepEqual(
      results.map((route) => route.id),
      [forward],
    );
  });
});
