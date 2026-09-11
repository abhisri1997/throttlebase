import test from "node:test";
import assert from "node:assert/strict";
import { formatDistance, formatDuration } from "./format";

test("rounds short distances to 10 m and medium ones to 50 m", () => {
  assert.equal(formatDistance(0), "0 m");
  assert.equal(formatDistance(44), "40 m");
  assert.equal(formatDistance(96), "100 m");
  assert.equal(formatDistance(362), "350 m");
  assert.equal(formatDistance(930), "950 m");
});

test("switches to kilometres once the rounded distance reaches 1 km", () => {
  assert.equal(formatDistance(980), "1.0 km");
  assert.equal(formatDistance(4_420), "4.4 km");
  assert.equal(formatDistance(23_400), "23 km");
});

test("shows a placeholder for distances that are not real", () => {
  assert.equal(formatDistance(Number.NaN), "--");
  assert.equal(formatDistance(-5), "--");
});

test("formats durations in minutes, then hours and minutes", () => {
  assert.equal(formatDuration(10), "1 min");
  assert.equal(formatDuration(12 * 60), "12 min");
  assert.equal(formatDuration(60 * 60), "1 hr");
  assert.equal(formatDuration(125 * 60), "2 hr 5 min");
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), "--");
});
