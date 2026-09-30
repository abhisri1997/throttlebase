import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Once a ride is over (completed or cancelled) nobody can join it, and its
 * captain cannot promote riders. Joining a completed ride also used to make
 * anyone a "participant", which is all a ride review checks.
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
const join = CONNECTION ? await import("../../services/ride-join.service.js") : null;

const CAPTAIN = "cccccccc-0000-0000-0000-0000000000f1";
const RIDER = "aaaaaaaa-0000-0000-0000-0000000000f2";
const NEWCOMER = "bbbbbbbb-0000-0000-0000-0000000000f3";

const createRide = async (pool: pg.Pool, status: string): Promise<string> => {
  const ride = await pool.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, start_point, end_point)
     VALUES ($1, 'Evening ride', $2, 'public', now() + interval '1 day',
             ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326)::geography,
             ST_SetSRID(ST_MakePoint(77.6, 12.92), 4326)::geography)
     RETURNING id`,
    [CAPTAIN, status],
  );
  const rideId = ride.rows[0].id as string;
  await pool.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now()),
       ($1, $3, 'rider', 'confirmed', now())`,
    [rideId, CAPTAIN, RIDER],
  );
  return rideId;
};

const roleOf = async (pool: pg.Pool, rideId: string, riderId: string): Promise<string | null> => {
  const result = await pool.query(
    `SELECT role FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
    [rideId, riderId],
  );
  return (result.rows[0]?.role as string | undefined) ?? null;
};

test("actions refused once a ride is over", { skip: !CONNECTION }, async (t) => {
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
       ($1, 'fc@example.test', 'Captain', 'finishedcaptain'),
       ($2, 'fr@example.test', 'Rider', 'finishedrider'),
       ($3, 'fn@example.test', 'Newcomer', 'finishednewcomer')
     ON CONFLICT (id) DO NOTHING`,
    [CAPTAIN, RIDER, NEWCOMER],
  );

  for (const status of ["completed", "cancelled"]) {
    await t.test(`nobody can join a ${status} ride`, async () => {
      const rideId = await createRide(admin, status);

      await assert.rejects(join!.joinOrRequestRide(rideId, NEWCOMER), /Cannot join/);
      assert.equal(await roleOf(admin, rideId, NEWCOMER), null);
    });

    await t.test(`the captain cannot promote on a ${status} ride`, async () => {
      const rideId = await createRide(admin, status);

      await assert.rejects(rides!.promoteToCoCaptain(rideId, CAPTAIN, RIDER), /Cannot promote/);
      assert.equal(await roleOf(admin, rideId, RIDER), "rider");
    });
  }

  await t.test("a scheduled ride can still be joined and its riders promoted", async () => {
    const rideId = await createRide(admin, "scheduled");

    assert.equal(await join!.joinOrRequestRide(rideId, NEWCOMER), "joined");
    assert.equal(await rides!.promoteToCoCaptain(rideId, CAPTAIN, RIDER), true);
    assert.equal(await roleOf(admin, rideId, RIDER), "co_captain");
  });
});
