import test from "node:test";
import assert from "node:assert/strict";
import {
  cumulativeDistances,
  decodePolyline,
  encodePolyline,
  haversineMeters,
  projectOntoPolyline,
} from "./polyline.js";

// Google's own worked example from the Encoded Polyline Algorithm Format docs.
const GOOGLE_FIXTURE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const GOOGLE_FIXTURE_POINTS = [
  { lat: 38.5, lng: -120.2 },
  { lat: 40.7, lng: -120.95 },
  { lat: 43.252, lng: -126.453 },
];

test("decodes Google's documented fixture exactly", () => {
  const decoded = decodePolyline(GOOGLE_FIXTURE);

  assert.equal(decoded.length, 3);
  decoded.forEach((point, i) => {
    assert.ok(Math.abs(point.lat - GOOGLE_FIXTURE_POINTS[i]!.lat) < 1e-9);
    assert.ok(Math.abs(point.lng - GOOGLE_FIXTURE_POINTS[i]!.lng) < 1e-9);
  });
});

test("encodes Google's documented fixture exactly", () => {
  assert.equal(encodePolyline(GOOGLE_FIXTURE_POINTS), GOOGLE_FIXTURE);
});

test("round-trips a long route without accumulating drift", () => {
  // Deltas are encoded relative to the previous point, so a truncating encoder
  // drifts further the longer the route. 500 points surfaces that.
  const points = Array.from({ length: 500 }, (_, i) => ({
    lat: 12.9716 + i * 0.00137,
    lng: 77.5946 + i * 0.00091,
  }));

  const decoded = decodePolyline(encodePolyline(points));

  assert.equal(decoded.length, points.length);
  for (let i = 0; i < points.length; i++) {
    assert.ok(
      Math.abs(decoded[i]!.lat - points[i]!.lat) <= 1e-5,
      `lat drifted at index ${i}`,
    );
    assert.ok(
      Math.abs(decoded[i]!.lng - points[i]!.lng) <= 1e-5,
      `lng drifted at index ${i}`,
    );
  }
});

test("encodes negative coordinates correctly", () => {
  const points = [
    { lat: -33.8688, lng: 151.2093 },
    { lat: -34.0, lng: 150.9 },
  ];

  const decoded = decodePolyline(encodePolyline(points));

  assert.ok(Math.abs(decoded[0]!.lat - points[0]!.lat) <= 1e-5);
  assert.ok(Math.abs(decoded[1]!.lng - points[1]!.lng) <= 1e-5);
});

test("cumulative distance accumulates along a straight line", () => {
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
  ];

  const cumulative = cumulativeDistances(line);
  const oneDegree = haversineMeters(line[0]!, line[1]!);

  assert.equal(cumulative[0], 0);
  assert.ok(Math.abs(cumulative[1]! - oneDegree) < 1);
  assert.ok(Math.abs(cumulative[2]! - oneDegree * 2) < 1);
});

test("projects a point beside the route onto the right spot", () => {
  // A due-east line along the equator; the point sits north of its midpoint.
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ];
  const total = haversineMeters(line[0]!, line[1]!);

  const projection = projectOntoPolyline({ lat: 0.01, lng: 0.5 }, line);

  // Halfway along, and ~0.01 degrees of latitude off it.
  assert.ok(Math.abs(projection.distanceAlongMeters - total / 2) < total * 0.02);
  assert.ok(Math.abs(projection.offsetMeters - 1111) < 60);
});

test("clamps projection to the route ends rather than extrapolating", () => {
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ];

  // Well past the far end of the segment.
  const beyond = projectOntoPolyline({ lat: 0, lng: 5 }, line);
  const total = cumulativeDistances(line)[1]!;

  assert.ok(Math.abs(beyond.distanceAlongMeters - total) < 1);
});

test("handles degenerate polylines without throwing", () => {
  assert.equal(
    projectOntoPolyline({ lat: 1, lng: 1 }, []).offsetMeters,
    Number.POSITIVE_INFINITY,
  );
  assert.equal(decodePolyline("").length, 0);
  assert.equal(encodePolyline([]), "");
});
