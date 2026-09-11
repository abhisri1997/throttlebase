import test from "node:test";
import assert from "node:assert/strict";
import { shouldPersistSample, type TrackPoint } from "./sampleThrottle.js";

const T0 = 1_757_592_000_000;
/** Along the equator, where 1° of longitude is about 111,320 m. */
const at = (meters: number, seconds: number): TrackPoint => ({
  lat: 0,
  lng: meters / 111_320,
  capturedAtMs: T0 + seconds * 1000,
});

test("keeps the first sample of a ride", () => {
  assert.equal(shouldPersistSample(undefined, at(0, 0)), true);
});

test("skips a fix that moved less than 20 m within 30 s", () => {
  assert.equal(shouldPersistSample(at(0, 0), at(12, 5)), false);
});

test("keeps a fix once the rider has moved 20 m", () => {
  assert.equal(shouldPersistSample(at(0, 0), at(25, 3)), true);
});

test("keeps a fix every 30 s even when standing still", () => {
  assert.equal(shouldPersistSample(at(0, 0), at(2, 30)), true);
});

test("ignores a fix older than the last sample", () => {
  assert.equal(shouldPersistSample(at(0, 10), at(500, 8)), false);
});
