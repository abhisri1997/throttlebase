import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * When a captain deletes their account, each ride they still lead passes to
 * the next leader in the same transaction — a co-captain first, then the
 * rider with the most completed rides, then whoever joined first — or is
 * cancelled when nobody is left. They also leave every open ride they joined,
 * freeing the seat, and every ride's rider count matches who is really on it.
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
const repository = CONNECTION ? await import("./riderRepository.js") : null;
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;
const leadership = CONNECTION ? await import("../../workers/processors/ride-leadership.processor.js") : null;
const purge = CONNECTION ? await import("../../workers/processors/account-purge.processor.js") : null;

const CAP = "c0c0c0c0-0000-0000-0000-0000000000d1"; // deletes their account
const CO = "c0c0c0c0-0000-0000-0000-0000000000d2";
const VET = "c0c0c0c0-0000-0000-0000-0000000000d3"; // four completed rides
const NEW = "c0c0c0c0-0000-0000-0000-0000000000d4";
const EXTRA = "c0c0c0c0-0000-0000-0000-0000000000d5";
const OTHER = "c0c0c0c0-0000-0000-0000-0000000000d6";
const GONE = "c0c0c0c0-0000-0000-0000-0000000000d7"; // deleted before hand-off existed
const RIDERS = [CAP, CO, VET, NEW, EXTRA, OTHER, GONE];

const LEADER_CHANGED_JOB = "ride.leader_changed";
const CAPTAIN_CHANGED_NOTIFICATION = "ride_captain_changed";

test("a deleting captain's open rides pass to the next leader", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);

  // ── Riders, reset on every run.
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at)
     SELECT id, 'handoff-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'handoff' || right(id::text, 2), NULL
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`UPDATE riders SET deleted_at = now() - interval '1 day' WHERE id = $1`, [GONE]);
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM jobs WHERE type = $1`, [LEADER_CHANGED_JOB]);
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1::uuid[])`, [RIDERS]);

  const ride = async (captainId: string, title: string, status = "scheduled"): Promise<string> =>
    (
      await admin.query(
        `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, current_rider_count)
         VALUES ($1, $2, $3, 'public', now() + interval '2 days', 99) RETURNING id`,
        [captainId, title, status],
      )
    ).rows[0].id as string;

  /** [riderId, role, minutes after 09:00 they joined] — the first is the captain. */
  const seat = async (rideId: string, members: Array<[string, string, number]>): Promise<void> => {
    for (const [riderId, role, minute] of members) {
      await admin.query(
        `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
         VALUES ($1, $2, $3, 'confirmed', timestamptz '2026-09-20 09:00Z' + make_interval(mins => $4))`,
        [rideId, riderId, role, minute],
      );
    }
  };

  // VET has four completed rides: three led by OTHER, plus E.
  for (const n of [1, 2, 3]) {
    const done = await ride(OTHER, `Past ride ${n}`, "completed");
    await seat(done, [[OTHER, "captain", 0], [VET, "rider", 1]]);
  }

  const rideA = await ride(CAP, "A: co-captain");
  await seat(rideA, [[CAP, "captain", 0], [NEW, "rider", 1], [VET, "rider", 2], [CO, "co_captain", 3]]);
  const rideB = await ride(CAP, "B: most rides");
  await seat(rideB, [[CAP, "captain", 0], [NEW, "rider", 1], [VET, "rider", 5]]);
  const rideC = await ride(CAP, "C: joined first");
  await seat(rideC, [[CAP, "captain", 0], [NEW, "rider", 1], [EXTRA, "rider", 2]]);
  const rideD = await ride(CAP, "D: alone");
  await seat(rideD, [[CAP, "captain", 0]]);
  const rideE = await ride(CAP, "E: finished", "completed");
  await seat(rideE, [[CAP, "captain", 0], [VET, "rider", 1]]);
  const rideF = await ride(VET, "F: someone else's");
  await seat(rideF, [[VET, "captain", 0], [CAP, "rider", 1], [NEW, "rider", 2]]);
  const rideG = await ride(CAP, "G: live", "active");
  await seat(rideG, [[CAP, "captain", 0], [CO, "co_captain", 1]]);
  const session = await admin.query(
    `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at) VALUES ($1, 'active', $2, now()) RETURNING id`,
    [rideG, CAP],
  );
  const sessionId = session.rows[0].id as string;
  await admin.query(
    `INSERT INTO ride_live_presence (session_id, rider_id, role, is_online) VALUES ($1, $2, 'captain', true), ($1, $3, 'co_captain', true)`,
    [sessionId, CAP, CO],
  );
  const rideH = await ride(GONE, "H: led by an already deleted rider");
  await seat(rideH, [[GONE, "captain", 0], [NEW, "rider", 1]]);

  const captainOf = async (rideId: string) =>
    (await admin.query(`SELECT captain_id, status, current_rider_count FROM rides WHERE id = $1`, [rideId])).rows[0] as {
      captain_id: string;
      status: string;
      current_rider_count: number;
    };
  const seatOf = async (rideId: string, riderId: string) =>
    (
      await admin.query(`SELECT role, status, left_at FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`, [
        rideId,
        riderId,
      ])
    ).rows[0] as { role: string; status: string; left_at: Date | null };

  // ── Act: CAP deletes their account.
  const deleted = await repository!.createRiderRepository(admin).softDeleteAndUnlink(CAP, new Date());
  assert.equal(deleted, true);

  await t.test("a co-captain takes over before any rider", async () => {
    const after = await captainOf(rideA);
    assert.equal(after.captain_id, CO);
    assert.equal(after.status, "scheduled");
    assert.equal((await seatOf(rideA, CO)).role, "captain");
  });

  await t.test("without a co-captain, the rider with the most completed rides takes over", async () => {
    assert.equal((await captainOf(rideB)).captain_id, VET);
  });

  await t.test("among riders with as many rides, whoever joined first takes over", async () => {
    assert.equal((await captainOf(rideC)).captain_id, NEW);
  });

  await t.test("a ride with nobody left is cancelled", async () => {
    const after = await captainOf(rideD);
    assert.equal(after.status, "cancelled");
    assert.equal(after.current_rider_count, 0);
  });

  await t.test("a finished ride keeps its captain", async () => {
    const after = await captainOf(rideE);
    assert.equal(after.captain_id, CAP);
    assert.equal(after.status, "completed");
    assert.equal((await seatOf(rideE, CAP)).status, "confirmed");
  });

  await t.test("the leaving rider drops out of every open ride, freeing the seat", async () => {
    for (const rideId of [rideA, rideB, rideC, rideD, rideF, rideG]) {
      const left = await seatOf(rideId, CAP);
      assert.equal(left.status, "dropped_out");
      assert.equal(left.role, "rider");
      assert.ok(left.left_at);
    }
    assert.equal((await captainOf(rideF)).captain_id, VET);
  });

  await t.test("every changed ride counts only the riders still on it", async () => {
    assert.equal((await captainOf(rideA)).current_rider_count, 3);
    assert.equal((await captainOf(rideB)).current_rider_count, 2);
    assert.equal((await captainOf(rideC)).current_rider_count, 2);
    assert.equal((await captainOf(rideF)).current_rider_count, 2);
    assert.equal((await captainOf(rideG)).current_rider_count, 1);
  });

  await t.test("on a live ride the new captain leads the session, so SOS alerts reach them", async () => {
    assert.equal((await captainOf(rideG)).captain_id, CO);
    const presence = await admin.query(
      `SELECT rider_id::text, role, is_online FROM ride_live_presence WHERE session_id = $1`,
      [sessionId],
    );
    const byRider = new Map(presence.rows.map((row) => [row.rider_id as string, row]));
    assert.equal(byRider.get(CO)?.role, "captain");
    assert.equal(byRider.get(CAP)?.role, "member");
    assert.equal(byRider.get(CAP)?.is_online, false);
  });

  await t.test("each hand-off queues a notification job in the same transaction", async () => {
    const jobs = await admin.query(`SELECT payload FROM jobs WHERE type = $1`, [LEADER_CHANGED_JOB]);
    const handedOff = jobs.rows.map((row) => `${row.payload.rideId}→${row.payload.newCaptainId}`).sort();
    assert.deepEqual(handedOff, [`${rideA}→${CO}`, `${rideB}→${VET}`, `${rideC}→${NEW}`, `${rideG}→${CO}`].sort());
  });

  await t.test("the new captain and the riders on the ride are told, the leaver is not", async () => {
    await leadership!.processRideLeaderChanged({ rideId: rideA, newCaptainId: CO });
    const notes = await admin.query(
      `SELECT rider_id::text, title FROM notifications WHERE type = $1 AND data->>'ride_id' = $2`,
      [CAPTAIN_CHANGED_NOTIFICATION, rideA],
    );
    const titles = new Map(notes.rows.map((row) => [row.rider_id as string, row.title as string]));
    assert.match(titles.get(CO) ?? "", /You're now the captain/);
    assert.ok(titles.has(VET));
    assert.ok(titles.has(NEW));
    assert.equal(titles.has(CAP), false);

    // Running the job again tells nobody twice.
    await leadership!.processRideLeaderChanged({ rideId: rideA, newCaptainId: CO });
    const again = await admin.query(
      `SELECT count(*)::int AS n FROM notifications WHERE type = $1 AND data->>'ride_id' = $2`,
      [CAPTAIN_CHANGED_NOTIFICATION, rideA],
    );
    assert.equal(again.rows[0].n, 3);
  });

  await t.test("a co-captain appointed from now on is dated, so the order is exact", async () => {
    assert.equal(await rides!.promoteToCoCaptain(rideB, VET, NEW), true);
    const promoted = await admin.query(
      `SELECT promoted_at FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
      [rideB, NEW],
    );
    assert.ok(promoted.rows[0].promoted_at);
  });

  await t.test("joining sets the rider count from who is on the ride, not by adding one", async () => {
    await admin.query(`UPDATE rides SET current_rider_count = 50 WHERE id = $1`, [rideF]);
    assert.equal(await rides!.joinRide(rideF, EXTRA), true);
    assert.equal((await captainOf(rideF)).current_rider_count, 3);
  });

  await t.test("the hourly purge hands off rides of riders deleted before this existed", async () => {
    const result = await purge!.processAccountPurge({});
    assert.ok(Number(result.ridesHandedOff) >= 1);
    assert.equal((await captainOf(rideH)).captain_id, NEW);
  });

  await t.test("handing off again finds nothing left to do", async () => {
    const result = await purge!.processAccountPurge({});
    assert.equal(result.ridesHandedOff, 0);
  });
});
