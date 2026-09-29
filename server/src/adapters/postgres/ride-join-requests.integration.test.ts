import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Rides that need approval (visibility 'private') show on Discover as a
 * preview, and riders ask to join them; the captain or a co-captain accepts
 * or declines. A declined rider may ask once more. Also: a rider who left a
 * ride can join it again, and the start location sent when joining is kept.
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
const join = CONNECTION ? await import("../../services/ride-join.service.js") : null;
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;
const roster = CONNECTION ? await import("../../services/ride-roster.service.js") : null;
const notices = CONNECTION ? await import("../../workers/processors/ride-join-requests.processor.js") : null;

const CAP = "7c7c7c7c-0000-0000-0000-0000000000b1";
const CO = "7c7c7c7c-0000-0000-0000-0000000000b2";
const RIDER = "7c7c7c7c-0000-0000-0000-0000000000b3";
const ASKER = "7c7c7c7c-0000-0000-0000-0000000000b4";
const OTHER = "7c7c7c7c-0000-0000-0000-0000000000b5";
const RIDERS = [CAP, CO, RIDER, ASKER, OTHER];

const REQUESTED_JOB = "ride.join_requested";
const ANSWERED_JOB = "ride.join_answered";

/** Fields that place a ride or its riders; never in a preview. */
const HIDDEN_FROM_PREVIEW = ["description", "start_point", "start_point_name", "end_point_name", "route_geojson", "participants", "stops"];

test("asking to join a ride that needs approval", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    // Its rides would crowd other tests' rides out of Discover's first page.
    await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'joinrq-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'joinrq' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM jobs WHERE type = ANY($1::text[])`, [[REQUESTED_JOB, ANSWERED_JOB]]);
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1::uuid[])`, [RIDERS]);

  /** A scheduled ride led by CAP, with CO as co-captain and RIDER on it. */
  const ride = async (visibility: "public" | "private", maxCapacity: number | null = null): Promise<string> => {
    const id = (
      await admin.query(
        `INSERT INTO rides (captain_id, title, description, status, visibility, scheduled_at, max_capacity,
                            start_point, start_point_name, end_point_name)
         VALUES ($1, 'Sunrise run', 'Meet at 12 Lake Road', 'scheduled', $2, now() + interval '2 days', $3,
                 ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326)::geography, '12 Lake Road', 'Nandi Hills')
         RETURNING id`,
        [CAP, visibility, maxCapacity],
      )
    ).rows[0].id as string;
    for (const [riderId, role] of [
      [CAP, "captain"],
      [CO, "co_captain"],
      [RIDER, "rider"],
    ]) {
      await admin.query(
        `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES ($1, $2, $3, 'confirmed', now())`,
        [id, riderId, role],
      );
    }
    await admin.query(`UPDATE rides SET current_rider_count = 3 WHERE id = $1`, [id]);
    return id;
  };
  const seat = async (id: string, riderId: string) =>
    (
      await admin.query(
        `SELECT status, decline_count, ST_X(start_location_override::geometry) AS lng
           FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
        [id, riderId],
      )
    ).rows[0] as { status: string; decline_count: number; lng: number | null } | undefined;
  const riderCount = async (id: string) =>
    Number((await admin.query(`SELECT current_rider_count FROM rides WHERE id = $1`, [id])).rows[0].current_rider_count);
  const jobs = async (type: string, id: string) =>
    (
      await admin.query(`SELECT payload FROM jobs WHERE type = $1 AND payload->>'rideId' = $2 ORDER BY created_at`, [
        type,
        id,
      ])
    ).rows.map((row) => row.payload as Record<string, unknown>);
  const view = async (id: string, riderId: string) =>
    (await join!.getRideForViewer(id, riderId)) as unknown as Record<string, unknown> | null;

  await t.test("a rider who left a public ride can join it again", async () => {
    const id = await ride("public");
    assert.equal(await roster!.leaveRide(id, RIDER), "left");
    assert.equal(await join!.joinOrRequestRide(id, RIDER), "joined");
    assert.equal((await seat(id, RIDER))?.status, "confirmed");
    assert.equal(await riderCount(id), 3);
  });

  await t.test("where a rider starts from is kept when they join", async () => {
    const id = await ride("public");
    assert.equal(await join!.joinOrRequestRide(id, ASKER, [77.5, 12.97]), "joined");
    assert.equal(Number((await seat(id, ASKER))?.lng), 77.5);
  });

  await t.test("asking to join holds no seat, and tells the leaders", async () => {
    const id = await ride("private");
    assert.equal(await join!.joinOrRequestRide(id, ASKER), "requested");
    assert.equal((await seat(id, ASKER))?.status, "requested");
    assert.equal(await riderCount(id), 3);
    assert.equal((await jobs(REQUESTED_JOB, id)).length, 1);
    await assert.rejects(join!.joinOrRequestRide(id, ASKER), /already asked/);

    const result = await notices!.processRideJoinRequested((await jobs(REQUESTED_JOB, id))[0]!);
    assert.equal(result.notified, 2);
    const told = await admin.query(
      `SELECT rider_id::text FROM notifications WHERE type = 'ride_join_requested' AND data->>'ride_id' = $1 ORDER BY rider_id`,
      [id],
    );
    assert.deepEqual(told.rows.map((row) => row.rider_id), [CAP, CO]);
  });

  await t.test("until accepted, a rider sees only a preview, on the ride page and on Discover", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, ASKER);

    assert.equal(await rides!.getRideById(id, ASKER), null);
    const preview = await view(id, ASKER);
    assert.equal(preview?.is_preview, true);
    assert.deepEqual(preview?.my_request, { status: "requested", can_request: false });
    assert.equal(preview?.captain_name, "Rider b1");
    for (const field of HIDDEN_FROM_PREVIEW) assert.equal(field in preview!, false, field);

    const listed = (await rides!.listDiscoverableRides(OTHER)).find((row) => row.id === id) as unknown as
      | Record<string, unknown>
      | undefined;
    assert.equal(listed?.is_preview, true);
    assert.deepEqual(listed?.my_request, { status: "none", can_request: true });
    for (const field of HIDDEN_FROM_PREVIEW) assert.equal(field in listed!, false, field);

    // Its own riders still see the whole ride on Discover.
    const own = (await rides!.listDiscoverableRides(RIDER)).find((row) => row.id === id) as unknown as Record<
      string,
      unknown
    >;
    assert.equal(own.start_point_name, "12 Lake Road");
    assert.equal("my_status" in own, false);
  });

  await t.test("the captain and co-captains see the requests; other riders don't", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, ASKER);
    for (const leader of [CAP, CO]) {
      const requests = (await view(id, leader))?.join_requests as Array<{ rider_id: string }>;
      assert.deepEqual(
        requests.map((request) => request.rider_id),
        [ASKER],
      );
    }
    assert.equal("join_requests" in (await view(id, RIDER))!, false);
  });

  await t.test("only the captain or a co-captain can answer", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, ASKER);
    await assert.rejects(join!.answerJoinRequest(id, RIDER, ASKER, true), /captain or a co-captain/);
    await assert.rejects(join!.answerJoinRequest(id, CO, OTHER, true), /no request/i);
  });

  await t.test("an accepted rider is on the ride, counted, sees it all, and is told", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, ASKER);
    await join!.answerJoinRequest(id, CO, ASKER, true);

    assert.equal((await seat(id, ASKER))?.status, "confirmed");
    assert.equal(await riderCount(id), 4);
    assert.equal((await view(id, ASKER))?.start_point_name, "12 Lake Road");

    await notices!.processRideJoinAnswered((await jobs(ANSWERED_JOB, id))[0]!);
    const told = await admin.query(
      `SELECT title FROM notifications WHERE type = 'ride_join_answered' AND rider_id = $1 AND data->>'ride_id' = $2`,
      [ASKER, id],
    );
    assert.match(told.rows[0].title, /^You're in/);
  });

  await t.test("accepting is refused when the ride is full", async () => {
    const id = await ride("private", 3);
    await join!.joinOrRequestRide(id, ASKER);
    await assert.rejects(join!.answerJoinRequest(id, CAP, ASKER, true), /maximum capacity/);
    assert.equal((await seat(id, ASKER))?.status, "requested");
  });

  await t.test("a declined rider may ask once more, and no more after that", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, ASKER);
    await join!.answerJoinRequest(id, CAP, ASKER, false);
    assert.deepEqual(await seat(id, ASKER), { status: "rejected", decline_count: 1, lng: null });
    assert.deepEqual((await view(id, ASKER))?.my_request, { status: "declined", can_request: true });

    await notices!.processRideJoinAnswered((await jobs(ANSWERED_JOB, id))[0]!);
    const told = await admin.query(
      `SELECT body FROM notifications WHERE type = 'ride_join_answered' AND rider_id = $1 AND data->>'ride_id' = $2`,
      [ASKER, id],
    );
    assert.match(told.rows[0].body, /ask once more/);

    assert.equal(await join!.joinOrRequestRide(id, ASKER), "requested");
    await join!.answerJoinRequest(id, CAP, ASKER, false);
    assert.deepEqual((await view(id, ASKER))?.my_request, { status: "declined", can_request: false });
    await assert.rejects(join!.joinOrRequestRide(id, ASKER), /declined/);
  });

  await t.test("a rider can withdraw a request; it still counts past declines", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, ASKER);
    await join!.answerJoinRequest(id, CAP, ASKER, false);
    await join!.joinOrRequestRide(id, ASKER);
    await join!.cancelJoinRequest(id, ASKER);
    assert.equal((await seat(id, ASKER))?.status, "dropped_out");
    await assert.rejects(join!.cancelJoinRequest(id, ASKER), /no request/i);
    assert.deepEqual((await view(id, ASKER))?.my_request, { status: "none", can_request: true });

    // A withdrawn request isn't announced to the leaders.
    const pending = (await jobs(REQUESTED_JOB, id)).at(-1)!;
    assert.equal((await notices!.processRideJoinRequested(pending)).skipped, "request_not_waiting");
  });

  await t.test("withdrawing and asking again doesn't tell the leaders again", async () => {
    const id = await ride("private");
    for (let ask = 0; ask < 3; ask += 1) {
      await join!.joinOrRequestRide(id, ASKER);
      for (const job of await jobs(REQUESTED_JOB, id)) await notices!.processRideJoinRequested(job);
      if (ask < 2) await join!.cancelJoinRequest(id, ASKER);
    }
    const told = await admin.query(
      `SELECT count(*)::int AS n FROM notifications WHERE type = 'ride_join_requested' AND rider_id = $1 AND data->>'ride_id' = $2`,
      [CAP, id],
    );
    assert.equal(told.rows[0].n, 1);
  });

  await t.test("deleting an account withdraws its requests", async () => {
    const id = await ride("private");
    await join!.joinOrRequestRide(id, OTHER);
    const client = await db!.default.connect();
    try {
      await client.query("BEGIN");
      await roster!.handOffRidesOf(client, OTHER, new Date());
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    assert.equal((await seat(id, OTHER))?.status, "dropped_out");
  });
});
