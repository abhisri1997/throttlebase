import test from "node:test";
import assert from "node:assert/strict";
import { isTrackTooShort, rideStats } from "./rideStats";

const byLabel = (stats: { label: string; value: string }[]) =>
  Object.fromEntries(stats.map((stat) => [stat.label, stat.value]));

test("with the riding split: distance, riding time, average while moving, stops and total", () => {
  const stats = byLabel(
    rideStats({
      distanceMeters: 12_400,
      durationSeconds: 45 * 60,
      riding: { ridingDistanceM: 12_000, ridingTimeS: 30 * 60, stoppedS: 15 * 60 },
    }),
  );
  assert.equal(stats["Average speed"], "24 km/h");
  assert.ok(stats["Distance"]);
  assert.ok(stats["Riding time"]);
  assert.ok(stats["Stopped"]);
  assert.ok(stats["Total time"]);
});

test("from an older server: the whole track, no stops or total", () => {
  const stats = byLabel(rideStats({ distanceMeters: 3_000, durationSeconds: 1_800, riding: null }));
  assert.equal(stats["Average speed"], "6.0 km/h");
  assert.equal(stats["Stopped"], undefined);
  assert.equal(stats["Total time"], undefined);
});

test("nothing ridden has no average speed", () => {
  const stats = byLabel(rideStats({ distanceMeters: 0, durationSeconds: 0, riding: null }));
  assert.equal(stats["Average speed"], undefined);
});

test("a track of a point or a few metres is too short to show", () => {
  assert.equal(isTrackTooShort({ coordinates: [1], distanceMeters: 500, durationSeconds: 60, riding: null }), true);
  assert.equal(isTrackTooShort({ coordinates: [1, 2], distanceMeters: 20, durationSeconds: 60, riding: null }), true);
  assert.equal(isTrackTooShort({ coordinates: [1, 2], distanceMeters: 800, durationSeconds: 60, riding: null }), false);
});
