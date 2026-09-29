import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * From the moment a rider deletes their account, other riders stop seeing
 * them in routes, rides, reviews, groups and road feedback — and their saved
 * start point stops shaping anyone's meeting point — though the rows stay
 * until the purge 30 days later.
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
const community = CONNECTION ? await import("../../services/community.service.js") : null;
const feedback = CONNECTION ? await import("../../services/road-feedback.service.js") : null;
const routes = CONNECTION ? await import("../../services/route.service.js") : null;

const GONE = "d4d4d4d4-0000-0000-0000-0000000000b1";
const ASHA = "e5e5e5e5-0000-0000-0000-0000000000b2";
const BALA = "f6f6f6f6-0000-0000-0000-0000000000b3";

const POINT = (lng: number, lat: number) =>
  `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

const LINE = `{"type":"LineString","coordinates":[[77.6,12.9],[77.7,13.0]]}`;

test("a deleted rider disappears from routes, rides, reviews, groups and road feedback", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at) VALUES
       ($1, NULL, 'Deleted rider', NULL, now()),
       ($2, 'rr-asha@example.test', 'Asha', 'rrasha', NULL),
       ($3, 'rr-bala@example.test', 'Bala', 'rrbala', NULL)
     ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
    [GONE, ASHA, BALA],
  );
  // Start each run clean for these riders.
  await admin.query(`DELETE FROM rides WHERE captain_id IN ($1, $2, $3)`, [GONE, ASHA, BALA]);
  await admin.query(`DELETE FROM routes WHERE creator_id IN ($1, $2, $3)`, [GONE, ASHA, BALA]);
  await admin.query(`DELETE FROM groups WHERE created_by IN ($1, $2, $3)`, [GONE, ASHA, BALA]);

  // ── Road feedback: the deleted rider and Bala both rated Asha's route.
  const ashaRoute = (
    await admin.query(
      `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name)
       VALUES ($1, 'Asha''s route', $2, 'public', 'Bengaluru', 'Nandi Hills') RETURNING id`,
      [ASHA, LINE],
    )
  ).rows[0].id as string;
  await admin.query(
    `INSERT INTO route_road_feedback (route_id, rider_id, as_described, reasons) VALUES
       ($1, $2, false, '{rough_surface}'), ($1, $3, true, '{}')`,
    [ashaRoute, GONE, BALA],
  );

  // ── Routes: the deleted rider's public route, starting where Asha's does.
  const goneRoute = (
    await admin.query(
      `INSERT INTO routes (creator_id, title, geojson, visibility, start_name, end_name, start_point, end_point)
       VALUES ($1, 'Deleted rider''s route', $2, 'public', 'Bengaluru', 'Nandi Hills',
               ${POINT(77.6, 12.9)}, ${POINT(77.7, 13.0)}) RETURNING id`,
      [GONE, LINE],
    )
  ).rows[0].id as string;

  // ── Rides: Asha captains one both others joined, with saved start points;
  //    the deleted rider captains an upcoming public ride Bala joined.
  const insertRide = async (captainId: string, title: string): Promise<string> =>
    (
      await admin.query(
        `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at, start_point_auto)
         VALUES ($1, $2, 'scheduled', 'public', now() + interval '2 days', true) RETURNING id`,
        [captainId, title],
      )
    ).rows[0].id as string;
  const ashaRide = await insertRide(ASHA, "Asha's ride");
  const goneRide = await insertRide(GONE, "Deleted rider's ride");
  await admin.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at, start_location_override) VALUES
       ($1, $2, 'captain', 'confirmed', now(), ${POINT(77.6, 12.9)}),
       ($1, $3, 'rider', 'confirmed', now(), ${POINT(77.5, 12.8)}),
       ($1, $4, 'rider', 'confirmed', now(), ${POINT(77.7, 13.0)}),
       ($5, $3, 'captain', 'confirmed', now(), NULL),
       ($5, $4, 'rider', 'confirmed', now(), NULL)`,
    [ashaRide, ASHA, GONE, BALA, goneRide],
  );
  await admin.query(
    `INSERT INTO ride_reviews (ride_id, rider_id, rating, review_text) VALUES ($1, $2, 1, 'meh'), ($1, $3, 5, 'great')`,
    [ashaRide, GONE, BALA],
  );

  // ── Groups: Asha's group, which the deleted rider and Bala joined.
  const group = await admin.query(
    `INSERT INTO groups (name, visibility, created_by) VALUES ('Weekend riders', 'public', $1) RETURNING id`,
    [ASHA],
  );
  const groupId = group.rows[0].id as string;
  await admin.query(
    `INSERT INTO group_members (group_id, rider_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [groupId, ASHA, GONE, BALA],
  );
  // …and the deleted rider's own public group, which Bala joined.
  const goneGroup = (
    await admin.query(
      `INSERT INTO groups (name, visibility, created_by) VALUES ('Deleted rider''s club', 'public', $1) RETURNING id`,
      [GONE],
    )
  ).rows[0].id as string;
  await admin.query(
    `INSERT INTO group_members (group_id, rider_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member')`,
    [goneGroup, GONE, BALA],
  );

  await t.test("road feedback totals leave out the deleted rider", async () => {
    const totals = await feedback!.getRouteRoadFeedback(ashaRoute);
    assert.equal(totals.total, 1);
    assert.equal(totals.described, 1);
    assert.deepEqual(totals.reasons, []);
  });

  await t.test("a deleted rider's routes can't be opened, listed or searched", async () => {
    assert.equal(await routes!.getRouteById(goneRoute, BALA), null);
    assert.notEqual(await routes!.getRouteById(ashaRoute, BALA), null);

    const listed = (await routes!.listVisibleRoutes(BALA)).map((route) => route.id);
    assert.equal(listed.includes(goneRoute), false);
    assert.equal(listed.includes(ashaRoute), true);

    const found = (
      await routes!.searchRoutes(BALA, {
        from: { lat: 12.9, lng: 77.6, name: "Bengaluru" },
        to: null,
        minKm: null,
        maxKm: null,
        highlights: [],
      })
    ).map((route) => route.id);
    assert.equal(found.includes(goneRoute), false);
    assert.equal(found.includes(ashaRoute), true);
  });

  await t.test("ride participant lists leave out the deleted rider", async () => {
    const ride = await rides!.getRideById(ashaRide, BALA);
    // The query returns participants; the Ride type doesn't declare them.
    const { participants } = ride as unknown as { participants: Array<{ rider_id: string }> };
    const ids = participants.map((p) => p.rider_id);
    assert.deepEqual(ids.sort(), [ASHA, BALA].sort());
  });

  await t.test("an upcoming ride led by a deleted rider leaves public discovery but stays with its riders", async () => {
    const forAsha = (await rides!.listDiscoverableRides(ASHA)).map((ride) => ride.id);
    assert.equal(forAsha.includes(goneRide), false);
    assert.equal(forAsha.includes(ashaRide), true);

    const forBala = (await rides!.listDiscoverableRides(BALA)).map((ride) => ride.id);
    assert.equal(forBala.includes(goneRide), true);
  });

  await t.test("a ride led by a deleted rider can't be opened or joined by its ID by anyone new", async () => {
    assert.equal(await rides!.getRideById(goneRide, ASHA), null);
    assert.notEqual(await rides!.getRideById(goneRide, BALA), null);
    await assert.rejects(rides!.joinRide(goneRide, ASHA), /Ride not found/);
  });

  await t.test("the deleted rider's start point no longer shapes the meeting point", async () => {
    const contributors = await rides!.listMeetingPointContributors(ashaRide);
    assert.deepEqual(contributors.map((c) => c.riderId).sort(), [ASHA, BALA].sort());
  });

  await t.test("ride reviews leave out the deleted rider", async () => {
    const reviews = await community!.getRideReviews(ashaRide);
    assert.deepEqual(reviews.map((review: { rider_id: string }) => review.rider_id), [BALA]);
  });

  await t.test("group member lists and counts leave out the deleted rider", async () => {
    const detail = await community!.getGroupById(groupId, BALA);
    const memberIds = (detail.members as Array<{ rider_id?: string; id?: string }>).map(
      (member) => member.rider_id ?? member.id,
    );
    assert.equal(memberIds.includes(GONE), false);
    assert.equal(Number(detail.member_count), 2);

    const listed = (await community!.listGroups(BALA, "all")).find(
      (row: { id: string }) => row.id === groupId,
    );
    assert.equal(Number(listed.member_count), 2);
  });

  await t.test("a group created by a deleted rider stays with its members but is hidden from and closed to anyone new", async () => {
    for (const scope of ["all", "public"] as const) {
      const ids = (await community!.listGroups(ASHA, scope)).map((row: { id: string }) => row.id);
      assert.equal(ids.includes(goneGroup), false, `listed in "${scope}"`);
      assert.equal(ids.includes(groupId), true, `own group missing from "${scope}"`);
    }
    assert.equal(await community!.getGroupById(goneGroup, ASHA), null);
    await assert.rejects(community!.joinGroup(goneGroup, ASHA), /Group not found/);

    const forBala = (await community!.listGroups(BALA, "joined")).map((row: { id: string }) => row.id);
    assert.equal(forBala.includes(goneGroup), true);
    assert.notEqual(await community!.getGroupById(goneGroup, BALA), null);
  });
});
