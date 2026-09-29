import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Riders can leave a ride before it starts, and a captain can pass the ride
 * to another rider. A captain who leaves hands it to the next leader by the
 * same rule as account deletion, or cancels it with nobody left.
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
const roster = CONNECTION ? await import("../../services/ride-roster.service.js") : null;
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;
const leadership = CONNECTION ? await import("../../workers/processors/ride-leadership.processor.js") : null;

const CAP = "7b7b7b7b-0000-0000-0000-0000000000a1";
const CO = "7b7b7b7b-0000-0000-0000-0000000000a2";
const RIDER = "7b7b7b7b-0000-0000-0000-0000000000a3";
const OUTSIDER = "7b7b7b7b-0000-0000-0000-0000000000a4";
const GONE = "7b7b7b7b-0000-0000-0000-0000000000a5"; // a deleted account on the ride
const RIDERS = [CAP, CO, RIDER, OUTSIDER, GONE];

const LEADER_CHANGED_JOB = "ride.leader_changed";
const NOTIFICATION = "ride_captain_changed";

test("leaving a ride and passing the captaincy on", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'leave-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'leave' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`UPDATE riders SET deleted_at = now() WHERE id = $1`, [GONE]);
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM jobs WHERE type = $1`, [LEADER_CHANGED_JOB]);
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1::uuid[])`, [RIDERS]);

  /** A ride led by CAP; members are [riderId, role]. */
  const ride = async (status: string, members: Array<[string, string]>): Promise<string> => {
    const id = (
      await admin.query(
        `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
         VALUES ($1, 'Sunday ride', $2, 'public', now() + interval '2 days') RETURNING id`,
        [CAP, status],
      )
    ).rows[0].id as string;
    let minute = 0;
    for (const [riderId, role] of [[CAP, "captain"], ...members] as Array<[string, string]>) {
      await admin.query(
        `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
         VALUES ($1, $2, $3, 'confirmed', timestamptz '2026-09-20 09:00Z' + make_interval(mins => $4))`,
        [id, riderId, role, minute++],
      );
    }
    await admin.query(
      `UPDATE rides SET current_rider_count = (SELECT count(*) FROM ride_participants WHERE ride_id = $1) WHERE id = $1`,
      [id],
    );
    return id;
  };
  const rideRow = async (id: string) =>
    (await admin.query(`SELECT captain_id::text, status, current_rider_count FROM rides WHERE id = $1`, [id]))
      .rows[0] as { captain_id: string; status: string; current_rider_count: number };
  const seat = async (id: string, riderId: string) =>
    (
      await admin.query(`SELECT role, status, promoted_at FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`, [
        id,
        riderId,
      ])
    ).rows[0] as { role: string; status: string; promoted_at: Date | null } | undefined;
  const jobsFor = async (id: string) =>
    (
      await admin.query(`SELECT payload FROM jobs WHERE type = $1 AND payload->>'rideId' = $2 ORDER BY created_at`, [
        LEADER_CHANGED_JOB,
        id,
      ])
    ).rows.map((row) => row.payload as Record<string, unknown>);

  await t.test("a rider leaves before the start, freeing the seat", async () => {
    const id = await ride("scheduled", [[RIDER, "rider"]]);
    assert.equal(await roster!.leaveRide(id, RIDER), "left");
    assert.equal((await seat(id, RIDER))?.status, "dropped_out");
    assert.equal((await rideRow(id)).current_rider_count, 1);
  });

  await t.test("a captain who leaves hands the ride to the next leader", async () => {
    const id = await ride("scheduled", [[RIDER, "rider"], [CO, "co_captain"]]);
    assert.equal(await roster!.leaveRide(id, CAP), "handed_over");
    assert.equal((await rideRow(id)).captain_id, CO);
    assert.equal((await seat(id, CAP))?.status, "dropped_out");
    assert.equal((await jobsFor(id))[0]?.reason, "left");
  });

  await t.test("a captain alone on the ride cancels it by leaving", async () => {
    const id = await ride("scheduled", [[GONE, "rider"]]);
    assert.equal(await roster!.leaveRide(id, CAP), "ride_cancelled");
    assert.equal((await rideRow(id)).status, "cancelled");
  });

  await t.test("leaving is refused once the ride has started or finished, and for outsiders", async () => {
    const live = await ride("active", [[RIDER, "rider"]]);
    await assert.rejects(roster!.leaveRide(live, RIDER), /finish your ride/i);
    const done = await ride("completed", [[RIDER, "rider"]]);
    await assert.rejects(roster!.leaveRide(done, RIDER), /over/i);
    const open = await ride("scheduled", [[RIDER, "rider"]]);
    await assert.rejects(roster!.leaveRide(open, OUTSIDER), /not on this ride/i);
  });

  await t.test("the captain sees who takes over before leaving", async () => {
    const id = await ride("scheduled", [[RIDER, "rider"], [CO, "co_captain"]]);
    const asCaptain = (await rides!.getRideById(id, CAP)) as unknown as { next_captain: { rider_id: string } };
    assert.equal(asCaptain.next_captain.rider_id, CO);
    const asRider = (await rides!.getRideById(id, RIDER)) as unknown as { next_captain?: unknown };
    assert.equal(asRider.next_captain, undefined);
    const alone = await ride("scheduled", []);
    const aloneView = (await rides!.getRideById(alone, CAP)) as unknown as { next_captain: unknown };
    assert.equal(aloneView.next_captain, null);
  });

  await t.test("a captain passes the ride on and stays as co-captain, even mid-ride", async () => {
    const id = await ride("active", [[RIDER, "rider"], [CO, "co_captain"]]);
    const session = await admin.query(
      `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at) VALUES ($1, 'active', $2, now()) RETURNING id`,
      [id, CAP],
    );
    const sessionId = session.rows[0].id as string;
    await admin.query(
      `INSERT INTO ride_live_presence (session_id, rider_id, role) VALUES ($1, $2, 'captain'), ($1, $3, 'member')`,
      [sessionId, CAP, RIDER],
    );

    await roster!.passCaptaincy(id, CAP, RIDER);

    assert.equal((await rideRow(id)).captain_id, RIDER);
    assert.equal((await seat(id, RIDER))?.role, "captain");
    const former = await seat(id, CAP);
    assert.equal(former?.role, "co_captain");
    assert.equal(former?.status, "confirmed");
    assert.ok(former?.promoted_at);
    const presence = await admin.query(`SELECT rider_id::text, role FROM ride_live_presence WHERE session_id = $1`, [
      sessionId,
    ]);
    const roles = new Map(presence.rows.map((row) => [row.rider_id as string, row.role as string]));
    assert.equal(roles.get(RIDER), "captain");
    assert.equal(roles.get(CAP), "co_captain");
    assert.equal((await jobsFor(id))[0]?.reason, "passed_on");
  });

  await t.test("the ride can only be passed by its captain, to someone on it", async () => {
    const id = await ride("scheduled", [[RIDER, "rider"], [GONE, "rider"]]);
    await assert.rejects(roster!.passCaptaincy(id, RIDER, CAP), /only the captain/i);
    await assert.rejects(roster!.passCaptaincy(id, CAP, OUTSIDER), /not on this ride/i);
    await assert.rejects(roster!.passCaptaincy(id, CAP, GONE), /not on this ride/i);
    await assert.rejects(roster!.passCaptaincy(id, CAP, CAP), /already the captain/i);
    const done = await ride("completed", [[RIDER, "rider"]]);
    await assert.rejects(roster!.passCaptaincy(done, CAP, RIDER), /over/i);
  });

  await t.test("riders are told who handed the ride over, every time it moves", async () => {
    const id = await ride("scheduled", [[RIDER, "rider"], [CO, "rider"]]);
    await roster!.passCaptaincy(id, CAP, RIDER);
    await roster!.passCaptaincy(id, RIDER, CAP);
    await roster!.passCaptaincy(id, CAP, RIDER);
    for (const payload of await jobsFor(id)) {
      await leadership!.processRideLeaderChanged(payload);
    }
    const madeCaptain = await admin.query(
      `SELECT body FROM notifications
        WHERE type = $1 AND rider_id = $2 AND data->>'ride_id' = $3 AND title LIKE 'You''re now the captain%'
        ORDER BY created_at`,
      [NOTIFICATION, RIDER, id],
    );
    // Made captain twice: told twice.
    assert.equal(madeCaptain.rows.length, 2);
    assert.match(madeCaptain.rows[0].body, /Rider a1 handed the ride over/);
  });
});
