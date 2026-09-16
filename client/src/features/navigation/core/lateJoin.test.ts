import test from "node:test";
import assert from "node:assert/strict";
import type { LatLng, NavigationRoute, RouteLeg } from "../types/navigation";
import { groupTargetIndex, shouldOfferCatchUp } from "./lateJoin";
import { buildTripGeometry } from "./routeProgress";

/** Points on the equator, where 0.01° of longitude is about 1112 m. */
const at = (longitude: number, latitude = 0): LatLng => ({ latitude, longitude });

const leg = (from: number, to: number, index: number): RouteLeg => ({
  index,
  start: at(from),
  end: at(to),
  polyline: [at(from), at(to)],
  steps: [],
  distanceMeters: 0,
  durationSeconds: 0,
});

// start(0) → stop-a(0.01) → stop-b(0.02) → destination(0.03)
const route = {
  source: "directions",
  legs: [leg(0, 0.01, 0), leg(0.01, 0.02, 1), leg(0.02, 0.03, 2)],
  polyline: [],
  steps: [],
  totalDistanceMeters: 0,
  totalDurationSeconds: 0,
} as unknown as NavigationRoute;

const trip = buildTripGeometry(route);
const start = at(0);

test("the group's target is the furthest any rider has reached", () => {
  const positions = [at(0.001), at(0.011), at(0.005)];

  assert.equal(groupTargetIndex(positions, trip), 2);
});

test("a group still at the start is heading to the first waypoint", () => {
  assert.equal(groupTargetIndex([at(0)], trip), 0);
});

test("no riders reporting leaves the group at the start", () => {
  assert.equal(groupTargetIndex([], trip), 0);
});

test("offers catching up to a rider far from a group that has left", () => {
  assert.equal(
    shouldOfferCatchUp({
      riderCoordinate: at(-0.01), // ~1.1 km the wrong side of the start
      start,
      groupTargetIndex: 2,
    }),
    true,
  );
});

test("does not ask while the group is still at the start", () => {
  assert.equal(
    shouldOfferCatchUp({
      riderCoordinate: at(-0.01),
      start,
      groupTargetIndex: 0,
    }),
    false,
  );
});

test("does not ask a rider who is already at the start", () => {
  assert.equal(
    shouldOfferCatchUp({
      riderCoordinate: at(0.001), // ~111 m away
      start,
      groupTargetIndex: 2,
    }),
    false,
  );
});
