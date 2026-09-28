import test from "node:test";
import assert from "node:assert/strict";
import type { MotionActivityObject } from "expo-location";
import { dominantActivity, freshActivity, MOTION_READING_FRESH_MS } from "./motionReading";

const LOW = 0;
const MEDIUM = 1;
const HIGH = 2;
const NOT_DETECTED = { detected: false, confidence: LOW };

const reading = (detected: Partial<Record<string, number>>): MotionActivityObject =>
  ({
    timestamp: 0,
    activities: Object.fromEntries(
      ["automotive", "cycling", "walking", "running", "stationary", "unknown"].map((type) => [
        type,
        detected[type] === undefined ? NOT_DETECTED : { detected: true, confidence: detected[type] },
      ]),
    ),
  }) as MotionActivityObject;

test("the activity the sensors are surest of is the rider's", () => {
  assert.equal(dominantActivity(reading({ walking: HIGH, stationary: MEDIUM })), "walking");
});

test("a stopped vehicle reads as the vehicle, not standing still", () => {
  // iOS flags a car waiting at a light as both automotive and stationary, with one confidence.
  assert.equal(dominantActivity(reading({ automotive: MEDIUM, stationary: MEDIUM })), "automotive");
});

test("a low-confidence guess is no reading", () => {
  assert.equal(dominantActivity(reading({ walking: LOW })), null);
});

test("unknown is no reading", () => {
  assert.equal(dominantActivity(reading({ unknown: HIGH })), null);
});

test("a recent reading goes with the fix", () => {
  const now = 1_000_000;
  assert.equal(freshActivity({ activity: "walking", receivedAtMs: now - 30_000, endedAtMs: null }, now), "walking");
});

test("a reading holds until the sensors report a change, however long that takes", () => {
  // The sensors only report changes: ten minutes in a jam is one "automotive" reading.
  const now = 1_000_000;
  assert.equal(freshActivity({ activity: "automotive", receivedAtMs: now - 10 * 60_000, endedAtMs: null }, now), "automotive");
});

test("once the app is in the background, a reading says nothing about later fixes", () => {
  // The sensors stop reporting in the background, so the rider may have got off unseen.
  const receivedAtMs = 1_000_000;
  const backgroundedAt = receivedAtMs + 60_000;
  const reading = { activity: "automotive" as const, receivedAtMs, endedAtMs: backgroundedAt };

  assert.equal(freshActivity(reading, backgroundedAt - 1_000), "automotive");
  assert.equal(freshActivity(reading, backgroundedAt + 1_000), undefined);
});

test("no reading sends nothing", () => {
  assert.equal(freshActivity(null, 1_000_000), undefined);
});

test("a reading taken well after a fix says nothing about it", () => {
  // Background fixes arrive in batches, some from minutes before the sensors woke up.
  const fixAtMs = 1_000_000;
  const later = { activity: "walking" as const, receivedAtMs: fixAtMs + MOTION_READING_FRESH_MS + 1, endedAtMs: null };
  assert.equal(freshActivity(later, fixAtMs), undefined);
});
