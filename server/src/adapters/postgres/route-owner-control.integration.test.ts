import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * A rider controls their own routes: they can delete one or change who sees
 * it, and only they can share it. Nobody else can do any of these.
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

const OWNER = "7d7d7d7d-0000-0000-0000-0000000000c1";
const OTHER = "7d7d7d7d-0000-0000-0000-0000000000c2";
const FRIEND = "7d7d7d7d-0000-0000-0000-0000000000c3";
const RIDERS = [OWNER, OTHER, FRIEND];
const MISSING = "7d7d7d7d-0000-0000-0000-0000000000ff";

const LINE = JSON.stringify({ type: "LineString", coordinates: [[77.6, 12.9], [77.7, 13.0]] });

test("a rider's control over their own routes", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1::uuid[])`, [RIDERS]);
    await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'owner-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'owner' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`DELETE FROM routes WHERE creator_id = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);

  const route = async (visibility: "public" | "private" | "specific_riders" = "public"): Promise<string> =>
    (
      await admin.query(
        `INSERT INTO routes (creator_id, title, geojson, visibility) VALUES ($1, 'Coffee loop', $2, $3) RETURNING id`,
        [OWNER, LINE, visibility],
      )
    ).rows[0].id as string;
  const exists = async (id: string) =>
    (await admin.query(`SELECT 1 FROM routes WHERE id = $1`, [id])).rows.length > 0;

  await t.test("the owner deletes their route; a ride planned on it keeps its road", async () => {
    const id = await route();
    await admin.query(`INSERT INTO route_bookmarks (route_id, rider_id) VALUES ($1, $2)`, [id, OTHER]);
    await admin.query(`INSERT INTO route_road_feedback (route_id, rider_id, as_described) VALUES ($1, $2, true)`, [
      id,
      OTHER,
    ]);
    const ride = (
      await admin.query(
        `INSERT INTO rides (captain_id, title, status, route_id, road_via, scheduled_at)
         VALUES ($1, 'On the loop', 'scheduled', $2, '[[77.65, 12.95]]'::jsonb, now() + interval '1 day') RETURNING id`,
        [OTHER, id],
      )
    ).rows[0].id as string;

    assert.equal(await routes!.deleteRoute(id, OWNER), true);
    assert.equal(await exists(id), false);
    const kept = (await admin.query(`SELECT route_id, road_via FROM rides WHERE id = $1`, [ride])).rows[0];
    assert.equal(kept.route_id, null);
    assert.deepEqual(kept.road_via, [[77.65, 12.95]]);
    assert.equal(await routes!.deleteRoute(id, OWNER), false);
  });

  await t.test("nobody else can delete a route, or change who sees it", async () => {
    const id = await route();
    assert.equal(await routes!.deleteRoute(id, OTHER), false);
    assert.equal(await routes!.setRouteVisibility(id, OTHER, "private"), null);
    assert.equal(await exists(id), true);
    assert.equal(await routes!.deleteRoute(MISSING, OWNER), false);
  });

  await t.test("made private, a public route is the owner's alone at once", async () => {
    const id = await route("public");
    assert.notEqual(await routes!.getRouteById(id, OTHER), null);

    assert.deepEqual(await routes!.setRouteVisibility(id, OWNER, "private"), { id, visibility: "private" });
    assert.equal(await routes!.getRouteById(id, OTHER), null);
    assert.equal((await routes!.listVisibleRoutes(OTHER)).some((r) => r.id === id), false);
    assert.notEqual(await routes!.getRouteById(id, OWNER), null);

    await routes!.setRouteVisibility(id, OWNER, "public");
    assert.notEqual(await routes!.getRouteById(id, OTHER), null);
  });

  await t.test("only the owner can share a route; a share can't open someone else's route", async () => {
    const id = await route("private");
    assert.equal(await routes!.shareRouteWithRider(id, OTHER, OTHER), "not_found");
    assert.equal(await routes!.getRouteById(id, OTHER), null);

    await routes!.setRouteVisibility(id, OWNER, "specific_riders");
    assert.equal(await routes!.shareRouteWithRider(id, OWNER, FRIEND), "shared");
    assert.equal(await routes!.shareRouteWithRider(id, OWNER, FRIEND), "already_shared");
    assert.equal(await routes!.shareRouteWithRider(id, OWNER, MISSING), "not_found");
    assert.notEqual(await routes!.getRouteById(id, FRIEND), null);
    assert.equal(await routes!.getRouteById(id, OTHER), null);
  });

  await t.test("made private, a shared route is closed to the riders it was shared with", async () => {
    const id = await route("specific_riders");
    await routes!.shareRouteWithRider(id, OWNER, FRIEND);
    await routes!.setRouteVisibility(id, OWNER, "private");
    assert.equal(await routes!.getRouteById(id, FRIEND), null);

    // Shared again, the old share counts again.
    await routes!.setRouteVisibility(id, OWNER, "specific_riders");
    assert.notEqual(await routes!.getRouteById(id, FRIEND), null);
  });
});
