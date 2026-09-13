import test from "node:test";
import assert from "node:assert/strict";
import type { LatLng } from "../types/navigation";
import { cumulativeDistances, haversineMeters } from "./geometry";
import { buildSimulatedFixes, pointAtDistance } from "./gpsSimulator";

/** Points on the equator, where 0.01° of longitude is about 1112 m. */
const at = (longitude: number, latitude = 0): LatLng => ({ latitude, longitude });

const route: LatLng[] = [at(0), at(0.01), at(0.02)];

test("pointAtDistance sits at the start and end of the polyline", () => {
  const cumulative = cumulativeDistances(route);

  assert.deepEqual(pointAtDistance(route, cumulative, 0), route[0]);
  assert.deepEqual(pointAtDistance(route, cumulative, -50), route[0]);
  assert.deepEqual(pointAtDistance(route, cumulative, 1_000_000), route[2]);
});

test("pointAtDistance interpolates halfway along a segment", () => {
  const cumulative = cumulativeDistances(route);
  const segmentLength = cumulative[1]! - cumulative[0]!;

  const midpoint = pointAtDistance(route, cumulative, segmentLength / 2);

  assert.ok(Math.abs(midpoint.longitude - 0.005) < 0.0001);
  assert.equal(midpoint.latitude, 0);
});

test("buildSimulatedFixes returns nothing for a degenerate polyline", () => {
  assert.deepEqual(buildSimulatedFixes([]), []);
  assert.deepEqual(buildSimulatedFixes([at(0)]), []);
});

test("buildSimulatedFixes starts at the route's first point and ends at its last", () => {
  const fixes = buildSimulatedFixes(route, { speedMps: 20, sampleIntervalMs: 1000 });

  assert.ok(fixes.length > 1);
  assert.deepEqual(fixes[0]!.coordinate, route[0]);
  assert.deepEqual(fixes[fixes.length - 1]!.coordinate, route[2]);
});

test("buildSimulatedFixes advances by speed * interval between samples", () => {
  const speedMps = 15;
  const sampleIntervalMs = 1000;
  const fixes = buildSimulatedFixes(route, { speedMps, sampleIntervalMs });

  const stepMeters = haversineMeters(fixes[0]!.coordinate, fixes[1]!.coordinate);
  assert.ok(Math.abs(stepMeters - speedMps) < 0.5);
});

test("buildSimulatedFixes timestamps advance by the sample interval", () => {
  const fixes = buildSimulatedFixes(route, {
    speedMps: 20,
    sampleIntervalMs: 500,
    startTimestamp: 1_000,
  });

  assert.equal(fixes[0]!.timestamp, 1_000);
  assert.equal(fixes[1]!.timestamp, 1_500);
  assert.equal(fixes[2]!.timestamp, 2_000);
});

test("buildSimulatedFixes heads east along an eastward route", () => {
  const fixes = buildSimulatedFixes(route, { speedMps: 20, sampleIntervalMs: 1000 });

  for (const fix of fixes.slice(0, -1)) {
    assert.ok(fix.headingDegrees !== null);
    assert.ok(Math.abs(fix.headingDegrees! - 90) < 1);
  }
});

test("buildSimulatedFixes carries the requested accuracy and speed on every fix", () => {
  const fixes = buildSimulatedFixes(route, {
    speedMps: 9,
    sampleIntervalMs: 1000,
    accuracyMeters: 5,
  });

  for (const fix of fixes) {
    assert.equal(fix.accuracyMeters, 5);
    assert.equal(fix.speedMps, 9);
  }
});
