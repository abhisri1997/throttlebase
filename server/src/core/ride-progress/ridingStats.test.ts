import test from "node:test";
import assert from "node:assert/strict";
import { ridingStats } from "./ridingStats.js";
import { at, INDOOR_ACCURACY_M, ride, track, wait, walkOutAndBack, type Leg } from "./testTracks.js";

test("a ride's stats count the riding, not the walk at a stop", () => {
  const stats = ridingStats(track(ride(3000), wait(1), walkOutAndBack(300), wait(1), ride(3000)));

  assert.ok(Math.abs(stats.distanceKm - 6) < 0.1, `rode ${stats.distanceKm} km`);
  assert.ok(Math.abs(stats.ridingTimeS - 540) < 10, `rode ${stats.ridingTimeS} s`);
  assert.ok(Math.abs(stats.avgSpeedKmh - 40) < 1, `averaged ${stats.avgSpeedKmh} km/h`);
});

test("the top speed comes from the riding, never a walking fix", () => {
  const spike: Leg = (from) => ({
    samples: [at({ ...from, tMs: from.tMs + 15_000 }, 140, INDOOR_ACCURACY_M)],
    end: { ...from, tMs: from.tMs + 15_000 },
  });

  const stats = ridingStats(track(ride(3000, 55), walkOutAndBack(200), spike, walkOutAndBack(200), ride(3000, 40)));

  assert.equal(stats.maxSpeedKmh, 55);
});

test("a ride with no fixes has no stats", () => {
  assert.deepEqual(ridingStats([]), { distanceKm: 0, ridingTimeS: 0, avgSpeedKmh: 0, maxSpeedKmh: 0 });
});
