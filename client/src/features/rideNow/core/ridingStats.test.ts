import test from "node:test";
import assert from "node:assert/strict";
import {
  averageSpeedKmh,
  elapsedSecondsAt,
  formatRiddenKm,
  formatRidingClock,
  ridingBarSubtitle,
  ridingBarTitle,
  ridingDetailLine,
} from "./ridingStats";

test("the riding clock reads hours, minutes and seconds", () => {
  assert.equal(formatRidingClock(0), "0:00:00");
  assert.equal(formatRidingClock(59), "0:00:59");
  assert.equal(formatRidingClock(4360), "1:12:40");
  assert.equal(formatRidingClock(36_000), "10:00:00");
  assert.equal(formatRidingClock(-5), "0:00:00");
  assert.equal(formatRidingClock(Number.NaN), "0:00:00");
});

test("the clock runs on from the server's reading", () => {
  assert.equal(elapsedSecondsAt(100, 1_000, 1_000), 100);
  assert.equal(elapsedSecondsAt(100, 1_000, 6_400), 105);
  // A phone clock behind the reading never runs the ride backwards.
  assert.equal(elapsedSecondsAt(100, 5_000, 1_000), 100);
});

test("distance ridden reads in km with one decimal", () => {
  assert.equal(formatRiddenKm(38.44), "38.4 km");
  assert.equal(formatRiddenKm(0), "0.0 km");
  assert.equal(formatRiddenKm(-1), "0.0 km");
});

test("average speed waits for a minute of riding", () => {
  assert.equal(averageSpeedKmh(0.5, 30), null);
  assert.equal(averageSpeedKmh(38.4, 4360), 32);
  assert.equal(averageSpeedKmh(0, 600), 0);
});

test("the live sheet shows the distance and, once known, the average", () => {
  assert.equal(ridingDetailLine(38.4, 4360), "38.4 km ridden · 32 km/h avg");
  assert.equal(ridingDetailLine(0.1, 20), "0.1 km ridden");
});

test("the ride bar says how long and how far", () => {
  assert.equal(ridingBarTitle(4360, 38.4), "Riding · 1 hr 13 min · 38.4 km");
  assert.equal(ridingBarTitle(30, 0), "Riding · 1 min · 0.0 km");
});

test("the ride bar says whether the ride is being recorded", () => {
  assert.equal(ridingBarSubtitle("Morning ride", true), "Morning ride · recording");
  assert.equal(ridingBarSubtitle("Morning ride", false), "Morning ride · not recording");
  assert.equal(ridingBarSubtitle("", true), "Your ride · recording");
});
