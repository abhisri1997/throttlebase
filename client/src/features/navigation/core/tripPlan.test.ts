import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPlan, rideRoadVia, roadViaKey, tripPlanKey, type RideRouteSource } from "./tripPlan";

const ride: RideRouteSource = {
  start_point_geojson: { coordinates: [77.49, 10.23] },
  end_point_geojson: { coordinates: [77.48, 10.24] },
  start_point_name: "Zostel Kodaikanal",
  end_point_name: "Kodaikanal Lake",
  stops: [
    {
      id: "cafe",
      type: "rest",
      status: "approved",
      name: "Cafe Wavy Cap",
      sequence: 2,
      created_at: "2026-09-10T10:00:00Z",
      location: { coordinates: [77.485, 10.235] },
    },
    {
      id: "fuel",
      type: "fuel",
      status: "approved",
      name: "Indian Oil",
      sequence: 1,
      created_at: "2026-09-10T11:00:00Z",
      location: { coordinates: [77.487, 10.232] },
    },
    {
      id: "pending",
      type: "photo",
      status: "pending",
      sequence: 3,
      location: { coordinates: [77.49, 10.25] },
    },
    {
      id: "rejected",
      type: "photo",
      status: "rejected",
      sequence: 4,
      location: { coordinates: [77.49, 10.25] },
    },
    {
      id: "added-mid-ride",
      type: "photo",
      status: "approved",
      name: null,
      sequence: null,
      created_at: "2026-09-10T09:00:00Z",
      location: { coordinates: [77.481, 10.238] },
    },
    { id: "no-location", type: "fuel", status: "approved", sequence: 5, location: null },
    {
      id: "out-of-range",
      type: "fuel",
      status: "approved",
      sequence: 6,
      location: { coordinates: [77.4, 95] },
    },
    { type: "fuel", status: "approved" },
  ],
};

test("orders approved stops by plan, after the start and before the destination", () => {
  const plan = buildTripPlan(ride);

  assert.ok(plan);
  assert.deepEqual(
    plan.map((waypoint) => waypoint.id),
    ["start", "fuel", "cafe", "added-mid-ride", "destination"],
  );
});

test("leaves out pending, rejected and unlocatable stops", () => {
  const ids = buildTripPlan(ride)!.map((waypoint) => waypoint.id);

  for (const excluded of ["pending", "rejected", "no-location", "out-of-range"]) {
    assert.ok(!ids.includes(excluded), `${excluded} should not be a waypoint`);
  }
});

test("numbers stops and names them, falling back to their category", () => {
  const plan = buildTripPlan(ride)!;

  assert.deepEqual(
    plan.map((waypoint) => [waypoint.name, waypoint.stopNumber]),
    [
      ["Zostel Kodaikanal", null],
      ["Indian Oil", 1],
      ["Cafe Wavy Cap", 2],
      ["Photo stop", 3],
      ["Kodaikanal Lake", null],
    ],
  );
  assert.deepEqual(plan[1]!.coordinate, { latitude: 10.232, longitude: 77.487 });
});

test("returns null without a usable start or destination", () => {
  assert.equal(buildTripPlan(null), null);
  assert.equal(buildTripPlan({ ...ride, start_point_geojson: null }), null);
  assert.equal(buildTripPlan({ ...ride, end_point_geojson: { coordinates: ["x", 1] } }), null);
});

test("the plan key changes when a stop moves", () => {
  const plan = buildTripPlan(ride)!;
  const moved = plan.map((waypoint) =>
    waypoint.id === "fuel"
      ? { ...waypoint, coordinate: { latitude: 10.3, longitude: 77.4 } }
      : waypoint,
  );

  assert.notEqual(tripPlanKey(plan), tripPlanKey(moved));
  assert.equal(tripPlanKey(plan), tripPlanKey([...plan]));
});

test("a ride that follows a road hands its points to Directions in riding order", () => {
  const via = rideRoadVia({
    road_via: [
      [77.05, 12.91],
      [77.1, 12.89],
    ],
  });

  assert.deepEqual(via, [
    { latitude: 12.91, longitude: 77.05 },
    { latitude: 12.89, longitude: 77.1 },
  ]);
});

test("a ride with no road to follow, or one it cannot read, has no points", () => {
  assert.deepEqual(rideRoadVia({ road_via: null }), []);
  assert.deepEqual(rideRoadVia({}), []);
  assert.deepEqual(rideRoadVia({ road_via: "nonsense" }), []);
  assert.deepEqual(rideRoadVia({ road_via: [[77.05, 12.91], [500, 12.9], ["x", 1]] }), [
    { latitude: 12.91, longitude: 77.05 },
  ]);
});

test("following a road or not is a different plan to fetch", () => {
  const via = [{ latitude: 12.91, longitude: 77.05 }];

  assert.equal(roadViaKey([]), "");
  assert.notEqual(roadViaKey(via), roadViaKey([]));
});
