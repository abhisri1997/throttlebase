import test from "node:test";
import assert from "node:assert/strict";
import { ridingStats, ridingSummary } from "./ridingStats.js";
import { at, INDOOR_ACCURACY_M, M_PER_DEG_LNG, ORIGIN, ride, track, wait, walkOutAndBack, type Leg } from "./testTracks.js";

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

test("a finished ride says how long was riding, how long was stopped, and where", () => {
  const planned = { id: "cafe", lat: ORIGIN.lat, lng: ORIGIN.lng + 3000 / M_PER_DEG_LNG };

  const summary = ridingSummary(
    track(ride(3000), walkOutAndBack(300), ride(3000), wait(7), ride(3000)),
    [planned],
  );

  assert.ok(Math.abs(summary.ridingTimeS - 810) < 15, `rode ${summary.ridingTimeS} s`);
  assert.ok(Math.abs(summary.ridingDistanceM - 9000) < 120, `rode ${summary.ridingDistanceM} m, not the walk`);
  assert.deepEqual(
    summary.stops.map((stop) => [Math.round(stop.durationS / 60), stop.walkedAway, stop.planned]),
    [
      [7, true, true],
      [7, false, false],
    ],
  );
  assert.equal(summary.stoppedS, summary.stops[0]!.durationS + summary.stops[1]!.durationS);
});
