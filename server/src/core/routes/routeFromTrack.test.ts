import test from "node:test";
import assert from "node:assert/strict";
import type { TrackSample } from "../../utils/track.js";
import { MAX_ROUTE_POINTS, routeFromTrack } from "./routeFromTrack.js";

const START_MS = Date.parse("2026-09-27T09:00:00.000Z");
/** About 11 m of latitude. */
const STEP_DEG = 0.0001;

const sample = (lat: number, lng: number, second: number): TrackSample => ({
  lat,
  lng,
  accuracyM: 5,
  capturedAtMs: START_MS + second * 1000,
});

/** A straight northward ride of `count` fixes, one a second, ~11 m apart. */
const straightRide = (count: number): TrackSample[] =>
  Array.from({ length: count }, (_, i) => sample(12.9 + i * STEP_DEG, 77.6, i));

test("a ride too short to be a route gives no route", () => {
  // ~110 m: a rider who started and stopped in the car park.
  assert.equal(routeFromTrack(straightRide(11)), null);
});

test("a ride with no usable fixes gives no route", () => {
  assert.equal(routeFromTrack([]), null);
  assert.equal(
    routeFromTrack([{ ...sample(12.9, 77.6, 0), accuracyM: 500 }, { ...sample(12.95, 77.6, 60), accuracyM: 500 }]),
    null,
  );
});

test("a straight ride is stored as its two ends, longitude first", () => {
  const route = routeFromTrack(straightRide(200));

  assert.ok(route);
  assert.equal(route.coordinates.length, 2);
  assert.deepEqual(route.coordinates[0], [77.6, 12.9]);
  assert.deepEqual(route.coordinates[1], [77.6, 12.9 + 199 * STEP_DEG]);
});

test("the distance is measured on the full track, not the simplified line", () => {
  const route = routeFromTrack(straightRide(200));

  assert.ok(route);
  // 199 steps of ~11.1 m.
  assert.ok(Math.abs(route.distanceKm - 2.21) < 0.02, `distance ${route.distanceKm}`);
});

test("a corner survives simplification", () => {
  const north = Array.from({ length: 100 }, (_, i) => sample(12.9 + i * STEP_DEG, 77.6, i));
  const corner = north[north.length - 1]!;
  const east = Array.from({ length: 100 }, (_, i) =>
    sample(corner.lat, 77.6 + (i + 1) * STEP_DEG, 100 + i),
  );

  const route = routeFromTrack([...north, ...east]);

  assert.ok(route);
  assert.equal(route.coordinates.length, 3);
  assert.deepEqual(route.coordinates[1], [corner.lng, corner.lat]);
});

test("a corner survives on a slow ride with fixes closer together than the tolerance", () => {
  // ~5.5 m a second: town traffic.
  const slowStep = STEP_DEG / 2;
  const north = Array.from({ length: 200 }, (_, i) => sample(12.9 + i * slowStep, 77.6, i));
  const corner = north[north.length - 1]!;
  const east = Array.from({ length: 200 }, (_, i) =>
    sample(corner.lat, 77.6 + (i + 1) * slowStep, 200 + i),
  );

  const route = routeFromTrack([...north, ...east]);

  assert.ok(route);
  assert.equal(route.coordinates.length, 3);
  const [lng, lat] = route.coordinates[1]!;
  assert.ok(Math.abs(lat - corner.lat) < 0.0001 && Math.abs(lng - corner.lng) < 0.0001);
});

test("a GPS spike does not end up in the route", () => {
  const ride = straightRide(200);
  // One fix 5 km east, gone again a second later.
  ride[100] = { ...ride[100]!, lng: 77.65 };

  const route = routeFromTrack(ride);

  assert.ok(route);
  assert.ok(route.coordinates.every(([lng]) => lng! < 77.61));
});

test("a long winding ride is capped to a bounded number of points", () => {
  // 20,000 fixes zig-zagging 30 m either side of the road.
  const winding = Array.from({ length: 20_000 }, (_, i) =>
    sample(12.9 + i * STEP_DEG * 0.5, 77.6 + (i % 2 === 0 ? 0 : 0.0003), i),
  );

  const route = routeFromTrack(winding);

  assert.ok(route);
  assert.ok(route.coordinates.length <= MAX_ROUTE_POINTS, `${route.coordinates.length} points`);
});
