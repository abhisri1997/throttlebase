import test from "node:test";
import assert from "node:assert/strict";
import type { LatLng } from "../types/navigation";
import { buildRollCall, summarizeRollCall, type RollCallRider } from "./rollCall";

/** Points on the equator, where 0.0001° of longitude is about 11 m. */
const at = (longitude: number, latitude = 0): LatLng => ({ latitude, longitude });

const start = at(0);

const riders: RollCallRider[] = [
  { riderId: "captain", displayName: "Abhinav", role: "captain" },
  { riderId: "near", displayName: "Near Rider", role: "member" },
  { riderId: "far", displayName: "Far Rider", role: "member" },
  { riderId: "silent", displayName: "Silent Rider", role: "member" },
];

const locations = {
  captain: { lat: 0, lon: 0 },
  near: { lat: 0, lon: 0.0005 }, // ~56 m — inside the 100 m gathering radius
  far: { lat: 0, lon: 0.02 }, // ~2.2 km away
};

test("places riders at the start, en route, or unreachable", () => {
  const entries = buildRollCall({ riders, locations, start });

  assert.equal(entries[0]!.state, "at_start");
  assert.equal(entries[1]!.state, "at_start");
  assert.equal(entries[2]!.state, "en_route");
  assert.equal(entries[3]!.state, "no_location");
  assert.equal(entries[3]!.distanceMeters, null);
});

test("reports how far a rider still has to come", () => {
  const entries = buildRollCall({ riders, locations, start });

  assert.ok(Math.abs(entries[2]!.distanceMeters! - 2224) < 5);
});

test("a rider broadcasting a broken position counts as unreachable", () => {
  const entries = buildRollCall({
    riders,
    locations: { ...locations, far: { lat: Number.NaN, lon: 0.02 } },
    start,
  });

  assert.equal(entries[2]!.state, "no_location");
});

test("groups the roll call with the nearest stragglers first", () => {
  const entries = buildRollCall({
    riders: [...riders, { riderId: "middle", displayName: "Middle Rider", role: "member" }],
    locations: { ...locations, middle: { lat: 0, lon: 0.005 } }, // ~556 m
    start,
  });

  const summary = summarizeRollCall(entries);

  assert.equal(summary.atStart.length, 2);
  assert.deepEqual(
    summary.enRoute.map((entry) => entry.riderId),
    ["middle", "far"],
  );
  assert.deepEqual(
    summary.noLocation.map((entry) => entry.riderId),
    ["silent"],
  );
  assert.equal(summary.hasAbsentees, true);
});

test("nobody is missing once every rider is at the start", () => {
  const summary = summarizeRollCall(
    buildRollCall({ riders: riders.slice(0, 2), locations, start }),
  );

  assert.equal(summary.hasAbsentees, false);
  assert.equal(summary.atStart.length, 2);
});

test("a wider radius forgives a rider parked down the road", () => {
  const entries = buildRollCall({
    riders,
    locations: { ...locations, far: { lat: 0, lon: 0.002 } }, // ~222 m
    start,
    radiusMeters: 250,
  });

  assert.equal(entries[2]!.state, "at_start");
});
