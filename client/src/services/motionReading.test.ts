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
  assert.equal(freshActivity({ activity: "walking", receivedAtMs: now - 30_000 }, now), "walking");
});

test("a reading too old to trust, or none at all, sends nothing", () => {
  const now = 1_000_000;
  assert.equal(freshActivity({ activity: "walking", receivedAtMs: now - MOTION_READING_FRESH_MS - 1 }, now), undefined);
  assert.equal(freshActivity(null, now), undefined);
});

test("a reading taken well after a fix says nothing about it", () => {
  // Background fixes arrive in batches, some from minutes before the sensors woke up.
  const fixAtMs = 1_000_000;
  const later = { activity: "walking" as const, receivedAtMs: fixAtMs + MOTION_READING_FRESH_MS + 1 };
  assert.equal(freshActivity(later, fixAtMs), undefined);
});
