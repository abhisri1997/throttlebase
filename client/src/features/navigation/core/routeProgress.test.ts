import test from "node:test";
import assert from "node:assert/strict";
import type { LatLng, NavigationRoute, RouteLeg } from "../types/navigation";
import { haversineMeters } from "./geometry";
import {
  advanceLegProgress,
  buildLegGeometry,
  buildTripGeometry,
  locateStep,
  placeRiderOnTrip,
  remainingLegSeconds,
  type LegProgress,
  type ProgressFix,
} from "./routeProgress";

/** Points on the equator, where 0.01° of longitude (one "unit") is about 1112 m. */
const at = (longitude: number, latitude = 0): LatLng => ({ latitude, longitude });
const UNIT = haversineMeters(at(0), at(0.01));

const assertClose = (actual: number, expected: number, tolerance: number, label: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );
};

const makeLeg = (
  polyline: LatLng[],
  stepEnds: LatLng[],
  overrides: Partial<RouteLeg> = {},
): RouteLeg => ({
  index: 0,
  start: polyline[0]!,
  end: polyline[polyline.length - 1]!,
  polyline,
  steps: stepEnds.map((end, index) => ({
    instruction: `Step ${index + 1}`,
    distanceMeters: UNIT,
    durationSeconds: 60,
    start: index === 0 ? polyline[0]! : stepEnds[index - 1]!,
    end,
    legIndex: 0,
  })),
  distanceMeters: UNIT * stepEnds.length,
  durationSeconds: 60 * stepEnds.length,
  ...overrides,
});

const east = (coordinate: LatLng): ProgressFix => ({ coordinate, headingDegrees: 90, speedMps: 10 });
const west = (coordinate: LatLng): ProgressFix => ({ coordinate, headingDegrees: 270, speedMps: 10 });

const ride = (geometry: ReturnType<typeof buildLegGeometry>, fixes: ProgressFix[]): LegProgress =>
  fixes.reduce<LegProgress | null>(
    (previous, next) => advanceLegProgress(geometry, next, previous),
    null,
  )!;

const straight = buildLegGeometry(makeLeg([at(0), at(0.01), at(0.02)], [at(0.01), at(0.02)]));
const outAndBack = buildLegGeometry(makeLeg([at(0), at(0.01), at(0)], [at(0.01), at(0)]));

test("maps each step end onto the leg, in order", () => {
  assertClose(straight.lengthMeters, 2 * UNIT, 0.5, "length");
  assertClose(straight.stepEndAlongMeters[0]!, UNIT, 0.5, "first step end");
  assert.equal(straight.stepEndAlongMeters[1], straight.lengthMeters);
});

test("step ends on an out-and-back leg land on the right pass", () => {
  const geometry = buildLegGeometry(
    makeLeg([at(0), at(0.01), at(0)], [at(0.005), at(0.01), at(0.005), at(0)]),
  );

  const [first, second, third] = geometry.stepEndAlongMeters;
  assertClose(first!, 0.5 * UNIT, 1, "outbound halfway");
  assertClose(second!, UNIT, 1, "turnaround");
  assertClose(third!, 1.5 * UNIT, 1, "return halfway");
});

test("progress follows the rider forward along the leg", () => {
  const progress = ride(straight, [east(at(0.002)), east(at(0.004)), east(at(0.006))]);

  assert.equal(progress.isOnRoute, true);
  assertClose(progress.distanceAlongMeters, 0.6 * UNIT, 1, "along");
});

test("on an out-and-back road the direction of travel picks the pass", () => {
  const nearTurnaround = [
    east(at(0.002)),
    east(at(0.004)),
    east(at(0.006)),
    east(at(0.008)),
    east(at(0.0095)),
  ];

  const stillOutbound = ride(outAndBack, [...nearTurnaround, east(at(0.0095))]);
  assertClose(stillOutbound.distanceAlongMeters, 0.95 * UNIT, 1, "riding east");

  const turnedBack = ride(outAndBack, [...nearTurnaround, west(at(0.0095))]);
  assertClose(turnedBack.distanceAlongMeters, 1.05 * UNIT, 1, "riding back west");
});

test("GPS jitter behind the rider never moves progress backwards", () => {
  const progress = ride(straight, [east(at(0.004)), east(at(0.0039))]);

  assertClose(progress.distanceAlongMeters, 0.4 * UNIT, 1, "held");
  assert.equal(progress.isOnRoute, true);
});

test("a fix far from the leg is off-route and holds progress", () => {
  const progress = ride(straight, [east(at(0.004)), east(at(0.005, 0.003))]); // ~333 m north

  assert.equal(progress.isOnRoute, false);
  assertClose(progress.distanceAlongMeters, 0.4 * UNIT, 1, "held");
});

test("locates the current step and the distance to its maneuver", () => {
  const early = locateStep(straight, 500);

  assert.equal(early.stepIndex, 0);
  assertClose(early.distanceToManeuverMeters, UNIT - 500, 1, "to the turn");
  assert.equal(locateStep(straight, 1500).stepIndex, 1);
});

test("remaining time prorates the current step and applies traffic", () => {
  const leg = makeLeg([at(0), at(0.01), at(0.02)], [at(0.01), at(0.02)]);
  const geometry = buildLegGeometry(leg);

  assertClose(remainingLegSeconds(leg, geometry, UNIT / 2), 90, 0.5, "half a step + one step");

  const congested = { ...leg, durationInTrafficSeconds: 240 };
  assertClose(remainingLegSeconds(congested, geometry, UNIT / 2), 180, 0.5, "doubled by traffic");
});

const plannedRoute: NavigationRoute = {
  source: "directions",
  legs: [
    makeLeg([at(0), at(0.01)], [at(0.01)]),
    { ...makeLeg([at(0.01), at(0.02)], [at(0.02)]), index: 1 },
  ],
  polyline: [],
  steps: [],
  totalDistanceMeters: 2 * UNIT,
  totalDurationSeconds: 120,
};

test("positions each waypoint along the planned route", () => {
  const trip = buildTripGeometry(plannedRoute);

  assert.equal(trip.polyline.length, 3, "shared leg joint is not duplicated");
  assert.equal(trip.waypointAlongMeters.length, 3);
  assertClose(trip.waypointAlongMeters[1]!, UNIT, 0.5, "stop");
  assertClose(trip.waypointAlongMeters[2]!, 2 * UNIT, 0.5, "destination");
});

test("a rider joining on the route heads to the next waypoint, not the start", () => {
  const trip = buildTripGeometry(plannedRoute);

  assert.equal(placeRiderOnTrip(at(0), trip), 0, "at the start");
  assert.equal(placeRiderOnTrip(at(0.005), trip), 1, "halfway to the stop");
  assert.equal(placeRiderOnTrip(at(0.0098), trip), 1, "just short of the stop");
  assert.equal(placeRiderOnTrip(at(0.0106), trip), 2, "just past the stop");
});

test("a rider away from the route heads to the start", () => {
  assert.equal(placeRiderOnTrip(at(0.005, 0.01), buildTripGeometry(plannedRoute)), 0);
});
