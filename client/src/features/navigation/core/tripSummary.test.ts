import test from "node:test";
import assert from "node:assert/strict";
import type { RouteLeg } from "../types/navigation";
import type { TripWaypoint } from "./tripPlan";
import { EMPTY_TRIP_SUMMARY, summarizeTrip, type TripSummaryInput } from "./tripSummary";

const origin = { latitude: 0, longitude: 0 };

const waypoint = (
  id: string,
  kind: TripWaypoint["kind"],
  name: string,
  stopNumber: number | null = null,
): TripWaypoint => ({ id, kind, coordinate: origin, name, category: null, stopNumber });

const waypoints = [
  waypoint("start", "start", "Zostel"),
  waypoint("stop-1", "stop", "Indian Oil", 1),
  waypoint("destination", "destination", "Kodaikanal Lake"),
];

const leg = (index: number, distanceMeters: number, durationSeconds: number): RouteLeg => ({
  index,
  start: origin,
  end: origin,
  polyline: [],
  steps: [],
  distanceMeters,
  durationSeconds,
});

const input = (overrides: Partial<TripSummaryInput>): TripSummaryInput => ({
  waypoints,
  phase: "NAVIGATING",
  isPlaced: true,
  targetIndex: 1,
  currentLeg: { meters: 400, seconds: 60 },
  laterLegs: [leg(1, 2_000, 240)],
  ...overrides,
});

test("before the rider is placed, summarises the whole ride to the destination", () => {
  const summary = summarizeTrip(
    input({ isPlaced: false, targetIndex: 0, currentLeg: null, laterLegs: [leg(0, 1_000, 120), leg(1, 2_000, 240)] }),
  );

  assert.deepEqual(summary, {
    toNextMeters: 3_000,
    toNextSeconds: 360,
    nextLabel: "Kodaikanal Lake",
    totalSeconds: 360,
  });
});

test("while riding, counts to the next waypoint and adds later legs for the arrival time", () => {
  assert.deepEqual(summarizeTrip(input({})), {
    toNextMeters: 400,
    toNextSeconds: 60,
    nextLabel: "Stop 1 · Indian Oil",
    totalSeconds: 300,
  });
});

test("waiting at a stop, the next waypoint is the one after it", () => {
  const summary = summarizeTrip(
    input({ phase: "AT_WAYPOINT", currentLeg: { meters: 2_000, seconds: 240 }, laterLegs: [] }),
  );

  assert.equal(summary.nextLabel, "Kodaikanal Lake");
  assert.equal(summary.totalSeconds, 240);
});

test("leaves unknown figures empty rather than guessing", () => {
  const noLiveLeg = summarizeTrip(input({ currentLeg: null }));
  assert.equal(noLiveLeg.toNextSeconds, null);
  assert.equal(noLiveLeg.totalSeconds, null);

  const noPlannedRoute = summarizeTrip(input({ laterLegs: null }));
  assert.equal(noPlannedRoute.toNextSeconds, 60);
  assert.equal(noPlannedRoute.totalSeconds, null);
});

test("is empty once the ride is finished", () => {
  assert.deepEqual(summarizeTrip(input({ phase: "FINISHED" })), EMPTY_TRIP_SUMMARY);
});
