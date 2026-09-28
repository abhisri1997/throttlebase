import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DIRECTIONS_WAYPOINTS,
  MAX_ROAD_VIA_POINTS,
  planDirectionsWaypoints,
  roadViaPoints,
} from "./roadVia.js";
import type { LatLng } from "../../utils/polyline.js";

/** A zig-zag heading east: every other point is a bend ~1.1 km off the line. */
const zigZag = (bends: number, stepDeg = 0.05): [number, number][] =>
  Array.from({ length: bends + 1 }, (_, i) => [77 + i * stepDeg, 12.9 + (i % 2) * 0.01]);

const point = (lng: number, lat: number): LatLng => ({ lat, lng });

test("a road is steered by its bends, never by its ends", () => {
  const road = zigZag(6);

  const via = roadViaPoints(road);

  assert.deepEqual(via, road.slice(1, -1));
});

test("a straight road needs no steering", () => {
  const straight: [number, number][] = [
    [77.0, 12.9],
    [77.05, 12.9],
    [77.1, 12.9],
    [77.15, 12.9],
  ];

  assert.deepEqual(roadViaPoints(straight), []);
});

test("a long winding road is steered by at most twenty points, its sharpest bends", () => {
  const road = zigZag(200);

  const via = roadViaPoints(road);

  assert.ok(via.length > 0 && via.length <= MAX_ROAD_VIA_POINTS, `got ${via.length}`);
  const roadKeys = new Set(road.map(([lng, lat]) => `${lng},${lat}`));
  assert.ok(via.every(([lng, lat]) => roadKeys.has(`${lng},${lat}`)), "every point lies on the road");
  const longitudes = via.map(([lng]) => lng);
  assert.deepEqual(longitudes, [...longitudes].sort((a, b) => a - b), "in riding order");
});

test("bends within a kilometre of either end are left out", () => {
  const road: [number, number][] = [
    [77.0, 12.9],
    [77.002, 12.903], // ~400 m from the start
    [77.05, 12.91],
    [77.1, 12.9],
    [77.198, 12.897], // ~400 m from the end
    [77.2, 12.9],
  ];

  assert.deepEqual(roadViaPoints(road), [
    [77.05, 12.91],
    [77.1, 12.9],
  ]);
});

test("a single bend is not worth steering by", () => {
  const road: [number, number][] = [
    [77.0, 12.9],
    [77.05, 12.95],
    [77.1, 12.9],
  ];

  assert.deepEqual(roadViaPoints(road), []);
});

/* -------------------------------------------------------------------------- */

const origin = point(77.0, 12.9);
const destination = point(77.3, 12.9);
const via = [point(77.05, 12.91), point(77.1, 12.89), point(77.15, 12.91), point(77.2, 12.89), point(77.25, 12.91)];

const describe = (plan: ReturnType<typeof planDirectionsWaypoints>): string[] =>
  plan.map((waypoint) => `${waypoint.isVia ? "via" : "stop"} ${waypoint.point.lng}`);

test("without a road to follow, the stops are the waypoints", () => {
  const stop = point(77.12, 12.9);

  const plan = planDirectionsWaypoints({ origin, destination, stopovers: [stop], via: [] });

  assert.deepEqual(describe(plan), ["stop 77.12"]);
});

test("the road's points are ridden in order, with each stop where it falls along the road", () => {
  const fuel = point(77.12, 12.9);
  const lunch = point(77.22, 12.9);

  const plan = planDirectionsWaypoints({ origin, destination, stopovers: [fuel, lunch], via });

  assert.deepEqual(describe(plan), [
    "via 77.05",
    "via 77.1",
    "stop 77.12",
    "via 77.15",
    "via 77.2",
    "stop 77.22",
    "via 77.25",
  ]);
});

test("stops keep the order the captain planned, even if one sits further back on the road", () => {
  const first = point(77.22, 12.9);
  const second = point(77.12, 12.9);

  const plan = planDirectionsWaypoints({ origin, destination, stopovers: [first, second], via });

  assert.deepEqual(describe(plan), [
    "via 77.05",
    "via 77.1",
    "via 77.15",
    "via 77.2",
    "stop 77.22",
    "stop 77.12",
    "via 77.25",
  ]);
});

test("a rider already on the road is not sent back to points they have passed", () => {
  const riderOnRoad = point(77.16, 12.905);

  const plan = planDirectionsWaypoints({ origin: riderOnRoad, destination, stopovers: [], via });

  assert.deepEqual(describe(plan), ["via 77.2", "via 77.25"]);
});

test("a rider past the last point heads straight for the destination", () => {
  const nearlyThere = point(77.27, 12.9);

  const plan = planDirectionsWaypoints({ origin: nearlyThere, destination, stopovers: [], via });

  assert.deepEqual(describe(plan), []);
});

test("a rider still on the way to the start is steered along the whole road", () => {
  // ~11 km north of the road: not on it yet, so nothing counts as passed.
  const home = point(77.16, 13.0);

  const plan = planDirectionsWaypoints({ origin: home, destination, stopovers: [origin], via });

  assert.deepEqual(describe(plan), ["stop 77", "via 77.05", "via 77.1", "via 77.15", "via 77.2", "via 77.25"]);
});

test("Google's waypoint limit is kept by thinning the road's points, never the stops", () => {
  const manyVia = Array.from({ length: 20 }, (_, i) => point(77.01 + i * 0.014, 12.9 + (i % 2) * 0.01));
  const stops = Array.from({ length: 10 }, (_, i) => point(77.015 + i * 0.028, 12.9));

  const plan = planDirectionsWaypoints({ origin, destination, stopovers: stops, via: manyVia });

  assert.equal(plan.length, MAX_DIRECTIONS_WAYPOINTS);
  assert.equal(plan.filter((waypoint) => !waypoint.isVia).length, 10);
  const viaLongitudes = plan.filter((waypoint) => waypoint.isVia).map((waypoint) => waypoint.point.lng);
  assert.deepEqual(viaLongitudes, [...viaLongitudes].sort((a, b) => a - b), "thinned points stay in order");
});

test("a leg that ends at the next stop is not steered past it", () => {
  const nextStop = point(77.12, 12.9);

  const plan = planDirectionsWaypoints({ origin, destination: nextStop, stopovers: [], via });

  assert.deepEqual(describe(plan), ["via 77.05", "via 77.1"]);
});

test("a leg to a stop before the road's first point is not steered at all", () => {
  const earlyStop = point(77.02, 12.9);

  const plan = planDirectionsWaypoints({ origin, destination: earlyStop, stopovers: [], via });

  assert.deepEqual(describe(plan), []);
});

/* -------------------------------------------------------------------------- */
/* A recorded track is not a clean road                                        */
/* -------------------------------------------------------------------------- */

const onRoad = (via: [number, number][], point: [number, number]): boolean =>
  via.some(([lng, lat]) => lng === point[0] && lat === point[1]);

test("a GPS jump away from the road and back is never steered through", () => {
  const spike: [number, number] = [77.12, 12.85]; // ~5.5 km south of the road, for one fix
  const road: [number, number][] = [...zigZag(3), spike, ...zigZag(6).slice(4)];

  const via = roadViaPoints(road);

  assert.ok(!onRoad(via, spike), `steered through the jump: ${JSON.stringify(via)}`);
  assert.ok(via.length > 0, "the real bends still steer");
});

test("a side trip off the road and back, like riding into a stop, is never steered through", () => {
  // Along the road, then 800 m up a lane to a café and back down it, then on.
  const road: [number, number][] = [
    [77.0, 12.9],
    [77.05, 12.91],
    [77.1, 12.9],
    [77.1003, 12.9036],
    [77.1006, 12.9072], // the café
    [77.1003, 12.9036],
    [77.1001, 12.9001],
    [77.15, 12.91],
    [77.2, 12.9],
  ];

  const via = roadViaPoints(road);

  assert.ok(!onRoad(via, [77.1006, 12.9072]), `steered to the café: ${JSON.stringify(via)}`);
  assert.deepEqual(via, [
    [77.05, 12.91],
    [77.1, 12.9],
    [77.15, 12.91],
  ]);
});

test("a loop that ends where it started is still steered all the way round", () => {
  const loop: [number, number][] = [
    [77.0, 12.9],
    [77.05, 12.95],
    [77.1, 12.9],
    [77.05, 12.85],
    [77.0005, 12.9002],
  ];

  assert.deepEqual(roadViaPoints(loop), [
    [77.05, 12.95],
    [77.1, 12.9],
    [77.05, 12.85],
  ]);
});
