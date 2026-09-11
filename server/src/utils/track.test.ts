import test from "node:test";
import assert from "node:assert/strict";
import { decodePolyline } from "./polyline.js";
import { buildTrack, cleanTrack, type TrackSample } from "./track.js";

const T0 = 1_757_592_000_000;
/** Along the equator, where 1° of longitude is about 111,320 m. */
const at = (meters: number, seconds: number, accuracyM: number | null = 5): TrackSample => ({
  lat: 0,
  lng: meters / 111_320,
  accuracyM,
  capturedAtMs: T0 + seconds * 1000,
});

const metersOf = (samples: TrackSample[]): number[] =>
  samples.map((sample) => Math.round(sample.lng * 111_320));

test("measures the distance and duration of a clean track", () => {
  const track = buildTrack([at(0, 0), at(100, 10), at(200, 20)]);

  assert.equal(track.pointCount, 3);
  assert.ok(Math.abs(track.distanceMeters - 200) <= 1);
  assert.equal(track.durationSeconds, 20);
  assert.equal(track.startedAtMs, T0);
  assert.equal(track.endedAtMs, T0 + 20_000);
});

test("returns an empty track when there are no samples", () => {
  const track = buildTrack([]);

  assert.equal(track.pointCount, 0);
  assert.equal(track.distanceMeters, 0);
  assert.equal(track.durationSeconds, 0);
  assert.equal(track.startedAtMs, null);
  assert.equal(track.encodedPolyline, "");
});

test("drops fixes less accurate than 50 m", () => {
  assert.deepEqual(metersOf(cleanTrack([at(0, 0), at(100, 10, 80), at(200, 20)])), [0, 200]);
});

test("removes a spike that disagrees with the fixes on both sides", () => {
  const cleaned = cleanTrack([at(0, 0), at(100, 10), at(5_000, 20), at(300, 30)]);

  assert.deepEqual(metersOf(cleaned), [0, 100, 300]);
});

test("drops an implausible first fix", () => {
  assert.deepEqual(metersOf(cleanTrack([at(50_000, 0), at(0, 10), at(100, 20)])), [0, 100]);
});

test("keeps a jump that the following fixes agree with", () => {
  const cleaned = cleanTrack([at(0, 0), at(100, 10), at(20_000, 60), at(20_100, 70)]);

  assert.deepEqual(metersOf(cleaned), [0, 100, 20_000, 20_100]);
});

test("orders samples by time, ignores repeats, and encodes what is left", () => {
  const track = buildTrack([at(200, 20), at(0, 0), at(100, 10), at(100, 10)]);
  const decoded = decodePolyline(track.encodedPolyline);

  assert.equal(track.pointCount, 3);
  assert.equal(decoded.length, 3);
  assert.ok(Math.abs(decoded[0]!.lng) < 1e-5);
  assert.ok(Math.abs(decoded[2]!.lng - 200 / 111_320) < 1e-5);
});
