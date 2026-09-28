import test from "node:test";
import assert from "node:assert/strict";
import { rideSummaryLabel } from "./rideSummary";

const track = { distanceMeters: 13_600, durationSeconds: 2_460 };

test("a finished ride reads as the riding, with the time stopped beside it", () => {
  assert.equal(
    rideSummaryLabel({ ...track, riding: { ridingTimeS: 1_585, ridingDistanceM: 12_520, stoppedS: 780 } }),
    "You rode 13 km in 26 min · stopped 13 min",
  );
});

test("a ride without stops just says how far and how long", () => {
  assert.equal(
    rideSummaryLabel({ ...track, riding: { ridingTimeS: 1_585, ridingDistanceM: 12_520, stoppedS: 0 } }),
    "You rode 13 km in 26 min",
  );
});

test("from a server that doesn't split out the riding, it reads the whole track", () => {
  assert.equal(rideSummaryLabel({ ...track, riding: null }), "You rode 14 km in 41 min");
});
