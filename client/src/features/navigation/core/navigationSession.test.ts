import test from "node:test";
import assert from "node:assert/strict";
import type { LatLng } from "../types/navigation";
import {
  arrivalRadiusMeters,
  createInitialSession,
  getWaypointStatuses,
  reduceNavigationSession,
  reconcileSessionWithPlan,
  restoreSession,
  type NavigationSessionEvent,
  type NavigationSessionState,
} from "./navigationSession";
import { tripPlanKey, type TripWaypoint } from "./tripPlan";

/** Points on the equator, where 0.01° of longitude is about 1112 m. */
const at = (longitude: number, latitude = 0): LatLng => ({ latitude, longitude });

const waypoint = (id: string, kind: TripWaypoint["kind"], coordinate: LatLng): TripWaypoint => ({
  id,
  kind,
  coordinate,
  name: id,
  category: null,
  stopNumber: null,
});

const trip: TripWaypoint[] = [
  waypoint("start", "start", at(0)),
  waypoint("stop-a", "stop", at(0.01)),
  waypoint("stop-b", "stop", at(0.02)),
  waypoint("destination", "destination", at(0.03)),
];

const fix = (coordinate: LatLng, accuracyMeters?: number): NavigationSessionEvent => ({
  type: "LOCATION",
  coordinate,
  accuracyMeters,
  timestamp: 1_757_592_000_000,
});

const run = (
  events: NavigationSessionEvent[],
  waypoints: TripWaypoint[] = trip,
  from: NavigationSessionState = createInitialSession(tripPlanKey(waypoints)),
): NavigationSessionState =>
  events.reduce((state, event) => reduceNavigationSession(state, event, waypoints), from);

const place = (targetIndex: number): NavigationSessionEvent => ({ type: "PLACE", targetIndex });

test("shows every waypoint as upcoming until the rider is placed", () => {
  const allUpcoming = ["upcoming", "upcoming", "upcoming", "upcoming"];

  assert.deepEqual(getWaypointStatuses(null, trip), allUpcoming);
  assert.deepEqual(getWaypointStatuses(run([]), trip), allUpcoming);
});

test("marks the waypoint being ridden to as next and those behind as done", () => {
  const state = run([place(1)]);

  assert.deepEqual(getWaypointStatuses(state, trip), ["visited", "next", "upcoming", "upcoming"]);
});

test("while waiting at a stop, the stop is done and the waypoint after it is next", () => {
  const state = run([place(1), fix(at(0.01))]);

  assert.equal(state.phase, "AT_WAYPOINT");
  assert.deepEqual(getWaypointStatuses(state, trip), ["visited", "visited", "next", "upcoming"]);
});

test("a skipped stop shows as done", () => {
  const state = run([place(1), { type: "SKIP_TARGET" }]);

  assert.deepEqual(getWaypointStatuses(state, trip), ["visited", "visited", "next", "upcoming"]);
});

test("nothing is next once the ride is finished", () => {
  const state = run([place(3), fix(at(0.03))]);

  assert.equal(state.phase, "FINISHED");
  assert.deepEqual(getWaypointStatuses(state, trip), ["visited", "visited", "visited", "visited"]);
});

test("ignores fixes until the rider has been placed on the trip", () => {
  const state = run([fix(at(0.01))]);

  assert.equal(state.isPlaced, false);
  assert.deepEqual(state.reachedAt, {});
});

test("placing a rider mid-ride counts the waypoints behind them as passed", () => {
  const state = run([place(2)]);

  assert.equal(state.targetIndex, 2);
  assert.deepEqual(state.skippedIds, ["start", "stop-a"]);
});

test("entering the arrival radius marks the stop reached", () => {
  const state = run([place(1), fix(at(0.0097))]); // ~33 m short of stop A

  assert.equal(state.phase, "AT_WAYPOINT");
  assert.equal(state.targetIndex, 1);
  assert.equal(state.reachedAt["stop-a"], 1_757_592_000_000);
});

test("a poor GPS fix widens the arrival radius", () => {
  assert.equal(run([place(1), fix(at(0.009))]).phase, "NAVIGATING"); // ~111 m away
  assert.equal(run([place(1), fix(at(0.009), 80)]).phase, "AT_WAYPOINT");
});

test("jitter inside the departure radius never starts the next leg", () => {
  const state = run([place(1), fix(at(0.01)), fix(at(0.009)), fix(at(0.011))]); // ±111 m

  assert.equal(state.phase, "AT_WAYPOINT");
  assert.equal(state.targetIndex, 1);
});

test("riding out past the departure radius starts the next leg", () => {
  const state = run([place(1), fix(at(0.01)), fix(at(0.0116))]); // ~178 m on

  assert.equal(state.phase, "NAVIGATING");
  assert.equal(state.targetIndex, 2);
});

test("reaching a later stop first skips the one before it", () => {
  const state = run([place(1), fix(at(0.02))]);

  assert.equal(state.phase, "AT_WAYPOINT");
  assert.equal(state.targetIndex, 2);
  assert.deepEqual(state.skippedIds, ["start", "stop-a"]);
});

test("a loop ride passing the finish mid-ride does not end there", () => {
  const loop: TripWaypoint[] = [
    waypoint("start", "start", at(0)),
    waypoint("stop-a", "stop", at(0.01)),
    waypoint("stop-b", "stop", at(0.02)),
    waypoint("destination", "destination", at(0)),
  ];

  const state = run([place(1), fix(at(0))], loop);

  assert.equal(state.phase, "NAVIGATING");
  assert.equal(state.targetIndex, 1);
});

test("arriving at the destination finishes the ride", () => {
  assert.equal(run([place(3), fix(at(0.03))]).phase, "FINISHED");
});

test("skipping moves past the target but never past the destination", () => {
  const skipped = run([place(1), { type: "SKIP_TARGET" }]);
  assert.equal(skipped.targetIndex, 2);
  assert.ok(skipped.skippedIds.includes("stop-a"));

  const leftStop = run([place(1), fix(at(0.01)), { type: "SKIP_TARGET" }]);
  assert.equal(leftStop.phase, "NAVIGATING");
  assert.equal(leftStop.targetIndex, 2);

  const atEnd = run([place(3)]);
  assert.deepEqual(reduceNavigationSession(atEnd, { type: "SKIP_TARGET" }, trip), atEnd);
});

test("arrival radius grows with GPS inaccuracy within fixed bounds", () => {
  assert.equal(arrivalRadiusMeters(undefined), 40);
  assert.equal(arrivalRadiusMeters(20), 40);
  assert.equal(arrivalRadiusMeters(60), 90);
  assert.equal(arrivalRadiusMeters(200), 120);
});

test("a stop added ahead mid-ride becomes the next target, not the start", () => {
  const riding = run([place(1), fix(at(0.01)), fix(at(0.0116))]); // left stop A
  const withNewStop = [
    trip[0]!,
    trip[1]!,
    waypoint("stop-new", "stop", at(0.015)),
    trip[2]!,
    trip[3]!,
  ];

  const reconciled = reconcileSessionWithPlan(riding, withNewStop, tripPlanKey(withNewStop));

  assert.equal(reconciled.phase, "NAVIGATING");
  assert.equal(withNewStop[reconciled.targetIndex]!.id, "stop-new");
});

test("a rider still waiting at a stop keeps waiting after the plan changes", () => {
  const waiting = run([place(1), fix(at(0.01))]);
  const withNewStop = [trip[0]!, trip[1]!, waypoint("stop-new", "stop", at(0.015)), trip[2]!, trip[3]!];

  const reconciled = reconcileSessionWithPlan(waiting, withNewStop, tripPlanKey(withNewStop));

  assert.equal(reconciled.phase, "AT_WAYPOINT");
  assert.equal(withNewStop[reconciled.targetIndex]!.id, "stop-a");
});

test("restoring an unreadable session starts afresh, a valid one resumes", () => {
  const planKey = tripPlanKey(trip);

  assert.deepEqual(restoreSession("not json", trip, planKey), createInitialSession(planKey));
  assert.deepEqual(restoreSession({ phase: "FLYING" }, trip, planKey), createInitialSession(planKey));

  const saved = run([place(1), fix(at(0.01))]);
  assert.deepEqual(restoreSession(JSON.parse(JSON.stringify(saved)), trip, planKey), saved);
});
