import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Ride now (docs/ride-now-ux.md): an unplanned ride that starts at once,
 * hidden from everyone else, and that a solo finish completes.
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
const rideNow = CONNECTION ? await import("../../services/ride-now.service.js") : null;
const rides = CONNECTION ? await import("../../services/ride.service.js") : null;
const rideJoin = CONNECTION ? await import("../../services/ride-join.service.js") : null;
const rideProgress = CONNECTION ? await import("../../services/ride-progress.service.js") : null;
const liveSession = CONNECTION ? await import("../../services/live-session.service.js") : null;

const SOLO = "d0d0d0d0-0000-4000-8000-000000000001";
const OTHER = "d0d0d0d0-0000-4000-8000-000000000002";

/** Positions due north of a point: 1° of latitude ≈ 111,320 m. */
const HOME = { lon: 77.64, lat: 12.91 };
const north = (metres: number) => HOME.lat + metres / 111_320;
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const sendFix = (rideId: string, metresNorth: number, ageSeconds: number) =>
  liveSession!.updateLivePresenceLocation(
    rideId,
    SOLO,
    { lon: HOME.lon, lat: north(metresNorth), accuracy_m: 8, captured_at: secondsAgo(ageSeconds) },
    { persistSample: true },
  );

const finishAnyRide = async (riderId: string) => {
  for (const ride of await rideProgress!.listRidesBeingRidden(riderId)) {
    await rideProgress!.finishOwnRide(ride.id, riderId);
  }
};

test("Ride now", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'ridenow-solo@example.test', 'Solo', 'ridenowsolo'),
       ($2, 'ridenow-other@example.test', 'Other', 'ridenowother')
     ON CONFLICT (id) DO NOTHING`,
    [SOLO, OTHER],
  );
  await finishAnyRide(SOLO);

  await t.test("starts an unplanned solo ride that is under way at once", async () => {
    const { ride } = await rideNow!.startRideNow(SOLO, { title: "Morning ride" });

    assert.equal(ride.kind, "unplanned");
    assert.equal(ride.visibility, "solo");
    assert.equal(ride.status, "active");

    const riding = await rideProgress!.listRidesBeingRidden(SOLO);
    assert.equal(riding.length, 1);
    assert.equal(riding[0]!.id, ride.id);
    assert.equal(riding[0]!.kind, "unplanned");
    assert.equal(riding[0]!.others_on_ride, false);
  });

  await t.test("a second Ride now while riding is refused", async () => {
    await assert.rejects(rideNow!.startRideNow(SOLO, { title: "Another ride" }), rideNow!.AlreadyRidingError);
  });

  await t.test("nobody else can find, open or join it", async () => {
    const [riding] = await rideProgress!.listRidesBeingRidden(SOLO);
    const rideId = riding!.id;

    const discovered = await rides!.listDiscoverableRides(OTHER);
    assert.equal(discovered.some((r) => r.id === rideId), false);
    assert.equal(await rides!.getRideById(rideId, OTHER), null);
    assert.equal(await rideJoin!.getRidePreview(rideId, OTHER), null);
    await assert.rejects(rideJoin!.joinOrRequestRide(rideId, OTHER), (error: unknown) => {
      // Riders can't tell a hidden ride from a missing one.
      return error instanceof rideJoin!.RideJoinError && (error.kind === "closed" || error.kind === "not_found");
    });
  });

  await t.test("its visibility can't be changed to make it public", async () => {
    const [riding] = await rideProgress!.listRidesBeingRidden(SOLO);
    await assert.rejects(rides!.updateRideInfo(riding!.id, SOLO, { visibility: "public" }), rides!.UnplannedVisibilityError);
  });

  await t.test("the riding list reports time and distance so far", async () => {
    const [riding] = await rideProgress!.listRidesBeingRidden(SOLO);
    // Points before the rider's start aren't kept, so start the ride earlier.
    await admin.query(
      `UPDATE ride_live_presence p SET ride_started_at = now() - interval '5 minutes'
       FROM ride_live_sessions s WHERE s.id = p.session_id AND s.ride_id = $1 AND p.rider_id = $2`,
      [riding!.id, SOLO],
    );
    // Recent enough to be used: older fixes are dropped as stale.
    await sendFix(riding!.id, 0, 40);
    await sendFix(riding!.id, 1_000, 30);

    const [after] = await rideProgress!.listRidesBeingRidden(SOLO);
    assert.ok(after!.elapsed_s >= 0);
    assert.ok(after!.distance_km > 0.9 && after!.distance_km < 1.1, `distance was ${after!.distance_km}`);
  });

  await t.test("a destination added mid-ride arms arrival", async () => {
    const [riding] = await rideProgress!.listRidesBeingRidden(SOLO);
    const destination: [number, number] = [HOME.lon, north(5_000)];
    const updated = await rides!.updateRideInfo(riding!.id, SOLO, {
      end_point_coords: destination,
      end_point_name: "Nandi Hills",
    });
    assert.ok(updated);

    // Arrival arms once the rider is well away from the destination.
    await sendFix(riding!.id, 2_000, 20);
    const fix = await sendFix(riding!.id, 4_950, 10);
    assert.equal(fix?.arrival, "arrived");
  });

  await t.test("finishing completes the ride, and Ride now works again", async () => {
    const [riding] = await rideProgress!.listRidesBeingRidden(SOLO);
    const finished = await rideProgress!.finishOwnRide(riding!.id, SOLO);
    assert.ok(finished.closedSession, "the only rider finishing closes the session");

    const status = await admin.query(`SELECT status FROM rides WHERE id = $1`, [riding!.id]);
    assert.equal(status.rows[0].status, "completed");
    assert.equal((await rideProgress!.listRidesBeingRidden(SOLO)).length, 0);

    const { ride } = await rideNow!.startRideNow(SOLO, { title: "Evening ride" });
    assert.equal(ride.status, "active");
    await finishAnyRide(SOLO);
  });

  await t.test("planned rides keep their visibility and stay in Discover", async () => {
    const created = await rides!.createRide(OTHER, {
      title: "Planned public ride",
      visibility: "public",
      status: "scheduled",
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      start_point_auto: false,
    });
    assert.equal(created!.kind, "planned");
    const discovered = await rides!.listDiscoverableRides(SOLO);
    assert.equal(discovered.some((r) => r.id === created!.id), true);
  });
});
