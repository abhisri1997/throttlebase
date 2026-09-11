import test from "node:test";
import assert from "node:assert/strict";
import type { LatLng } from "../types/navigation";
import {
  angleDeltaDegrees,
  bearingDegrees,
  cumulativeDistances,
  decodePolyline,
  haversineMeters,
  polylineAhead,
  projectOntoPolyline,
} from "./geometry";

/** Points on the equator, where 0.01° of longitude is about 1112 m. */
const at = (longitude: number, latitude = 0): LatLng => ({ latitude, longitude });
const HUNDREDTH_DEGREE_METERS = haversineMeters(at(0), at(0.01));

const assertClose = (actual: number, expected: number, tolerance: number, label: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );
};

test("decodes Google's documented polyline example", () => {
  const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  const expected = [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ];

  assert.equal(decoded.length, expected.length);
  decoded.forEach((point, index) => {
    assertClose(point.latitude, expected[index]![0]!, 1e-9, `latitude ${index}`);
    assertClose(point.longitude, expected[index]![1]!, 1e-9, `longitude ${index}`);
  });
});

test("measures bearings clockwise from north and wraps angle differences", () => {
  assertClose(bearingDegrees(at(0), at(0.01)), 90, 0.01, "due east");
  assertClose(bearingDegrees(at(0), at(0, 0.01)), 0, 0.01, "due north");
  assert.equal(angleDeltaDegrees(350, 10), 20);
  assert.equal(angleDeltaDegrees(90, 270), 180);
});

test("accumulates distance along a polyline", () => {
  const cumulative = cumulativeDistances([at(0), at(0.01), at(0.02)]);

  assert.equal(cumulative[0], 0);
  assertClose(cumulative[2]!, 2 * HUNDREDTH_DEGREE_METERS, 0.5, "total length");
});

test("projects a point beside the route onto the right spot", () => {
  const projection = projectOntoPolyline(at(0.005, 0.0005), [at(0), at(0.01)]);

  assert.ok(projection);
  assertClose(projection.distanceAlongMeters, HUNDREDTH_DEGREE_METERS / 2, 1, "along");
  assertClose(projection.offsetMeters, 55.6, 1, "offset");
});

test("keeps the projection inside the requested window", () => {
  const projection = projectOntoPolyline(
    at(0.015),
    [at(0), at(0.01), at(0.02)],
    undefined,
    { maxAlongMeters: 1000 },
  );

  assert.ok(projection);
  assertClose(projection.distanceAlongMeters, 1000, 0.5, "clamped along");
});

test("uses the direction of travel to pick a pass on an out-and-back road", () => {
  const outAndBack = [at(0), at(0.01), at(0)];

  const heading = (degrees: number) =>
    projectOntoPolyline(at(0.004), outAndBack, undefined, { headingDegrees: degrees });
  const outbound = heading(90);
  const inbound = heading(270);

  assert.ok(outbound && inbound);
  assertClose(outbound.distanceAlongMeters, 0.4 * HUNDREDTH_DEGREE_METERS, 1, "riding east");
  assertClose(inbound.distanceAlongMeters, 1.6 * HUNDREDTH_DEGREE_METERS, 1, "riding west");
});

test("prefers the earliest pass when asked, even if a later one is marginally closer", () => {
  // The return pass runs about 11 m north of the outbound one.
  const route = [at(0), at(0.01), at(0.01, 0.0001), at(0, 0.0001)];
  const point = at(0.004, 0.00008);

  const nearest = projectOntoPolyline(point, route);
  const earliest = projectOntoPolyline(point, route, undefined, {
    preferEarliestWithinMeters: 25,
  });

  assert.ok(nearest && earliest);
  assert.ok(
    nearest.distanceAlongMeters > HUNDREDTH_DEGREE_METERS,
    "without the preference the closer return pass wins",
  );
  assertClose(earliest.distanceAlongMeters, 0.4 * HUNDREDTH_DEGREE_METERS, 1, "earliest pass");
});

test("the line ahead starts exactly at the projected point", () => {
  const line = [at(0), at(0.01), at(0.02)];
  const projection = projectOntoPolyline(at(0.005), line);

  assert.ok(projection);
  const ahead = polylineAhead(line, projection);

  assert.equal(ahead.length, 3);
  assertClose(ahead[0]!.longitude, 0.005, 1e-9, "starts under the rider");
  assert.deepEqual(ahead.slice(1), line.slice(1));
});

test("handles empty and single-point polylines", () => {
  assert.equal(projectOntoPolyline(at(0), []), null);

  const single = projectOntoPolyline(at(0.001), [at(0)]);
  assert.ok(single);
  assertClose(single.offsetMeters, 111.2, 0.5, "distance to the only point");
});
