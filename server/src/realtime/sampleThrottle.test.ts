import test from "node:test";
import assert from "node:assert/strict";
import { createSampleThrottle, shouldPersistSample, type TrackPoint } from "./sampleThrottle.js";

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

const KEY = "ride-1:rider-1";

test("a batch reserved before any of it is stored still keeps only fixes 20 m apart", () => {
  // Every reservation happens before persistence resolves — the concurrent
  // handler case, where a background batch arrives all at once.
  const throttle = createSampleThrottle();
  const batch = [at(0, 0), at(5, 1), at(10, 2), at(25, 3), at(30, 4)];

  const kept = batch.filter((point) => throttle.reserve(KEY, point) !== null);

  assert.deepEqual(kept, [at(0, 0), at(25, 3)]);
});

test("releasing a sample that was not stored restores the previous baseline", () => {
  const throttle = createSampleThrottle();
  throttle.reserve(KEY, at(0, 0));

  throttle.reserve(KEY, at(25, 3))!.release();

  assert.equal(throttle.reserve(KEY, at(10, 4)), null);
  assert.notEqual(throttle.reserve(KEY, at(22, 5)), null);
});

test("releasing the first sample lets the next fix start the track", () => {
  const throttle = createSampleThrottle();

  throttle.reserve(KEY, at(0, 0))!.release();

  assert.notEqual(throttle.reserve(KEY, at(5, 1)), null);
});

test("a late release does not undo a newer reservation", () => {
  const throttle = createSampleThrottle();
  const first = throttle.reserve(KEY, at(0, 0))!;
  throttle.reserve(KEY, at(25, 3));

  first.release();

  assert.equal(throttle.reserve(KEY, at(30, 4)), null);
});

test("clearing a rider forgets only that rider's baselines", () => {
  const throttle = createSampleThrottle();
  throttle.reserve("ride-1:rider-a", at(0, 0));
  throttle.reserve("ride-1:rider-b", at(0, 0));

  throttle.clearRider("rider-a");

  assert.notEqual(throttle.reserve("ride-1:rider-a", at(1, 1)), null);
  assert.equal(throttle.reserve("ride-1:rider-b", at(1, 1)), null);
});
