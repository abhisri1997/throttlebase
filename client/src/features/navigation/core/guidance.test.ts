import test from "node:test";
import assert from "node:assert/strict";
import type { NavigationStep } from "../types/navigation";
import { buildGuidance, type GuidanceInput } from "./guidance";
import type { TripWaypoint } from "./tripPlan";

const origin = { latitude: 0, longitude: 0 };

const stop: TripWaypoint = {
  id: "stop-1",
  kind: "stop",
  coordinate: origin,
  name: "Indian Oil",
  category: "fuel",
  stopNumber: 2,
};

const destination: TripWaypoint = {
  id: "destination",
  kind: "destination",
  coordinate: origin,
  name: "Kodaikanal Lake",
  category: null,
  stopNumber: null,
};

const step = (overrides: Partial<NavigationStep>): NavigationStep => ({
  instruction: "Turn left onto MG Rd",
  roadName: "MG Rd",
  note: null,
  distanceMeters: 1_200,
  durationSeconds: 120,
  start: origin,
  end: origin,
  maneuver: "turn-left",
  legIndex: 0,
  ...overrides,
});

const riding = (overrides: Partial<GuidanceInput> = {}): GuidanceInput => ({
  rideState: "ACTIVE",
  phase: "NAVIGATING",
  isPlaced: true,
  target: stop,
  nextWaypoint: destination,
  leg: { upcomingStep: step({}), followingStep: null, distanceToManeuverMeters: 300 },
  ...overrides,
});

test("leads with the road name and the arrow for the next maneuver", () => {
  const guidance = buildGuidance(riding());

  assert.equal(guidance.icon, "turn-left");
  assert.equal(guidance.headline, "MG Rd");
  assert.equal(guidance.detail, "Turn left onto MG Rd");
  assert.equal(guidance.distanceMeters, 300);
  assert.equal(guidance.thenIcon, null);
});

test("falls back to the instruction when Google names no road", () => {
  const guidance = buildGuidance(
    riding({
      leg: {
        upcomingStep: step({ roadName: null, instruction: "Turn right", maneuver: "turn-right" }),
        followingStep: null,
        distanceToManeuverMeters: 80,
      },
    }),
  );

  assert.equal(guidance.headline, "Turn right");
  assert.equal(guidance.detail, null);
});

test("previews the maneuver after next only when it follows closely", () => {
  const close = buildGuidance(
    riding({
      leg: {
        upcomingStep: step({ distanceMeters: 150 }),
        followingStep: step({ maneuver: "turn-right" }),
        distanceToManeuverMeters: 300,
      },
    }),
  );
  assert.equal(close.thenIcon, "turn-right");

  const lastManeuver = buildGuidance(
    riding({
      leg: {
        upcomingStep: step({ distanceMeters: 150 }),
        followingStep: null,
        distanceToManeuverMeters: 300,
      },
    }),
  );
  assert.equal(lastManeuver.thenIcon, "arrive");
});

test("keeps Google's note on its own line", () => {
  const guidance = buildGuidance(
    riding({
      leg: {
        upcomingStep: step({ note: "Pass by Indian Oil (on the left)" }),
        followingStep: null,
        distanceToManeuverMeters: 300,
      },
    }),
  );

  assert.equal(guidance.note, "Pass by Indian Oil (on the left)");
});

test("counts down to the waypoint on the last step of a leg", () => {
  const guidance = buildGuidance(
    riding({ leg: { upcomingStep: null, followingStep: null, distanceToManeuverMeters: 120 } }),
  );

  assert.equal(guidance.icon, "arrive");
  assert.equal(guidance.headline, "Stop 2 · Indian Oil");
  assert.equal(guidance.distanceMeters, 120);
});

test("waiting at a stop, says where the next leg goes", () => {
  const guidance = buildGuidance(riding({ phase: "AT_WAYPOINT" }));

  assert.equal(guidance.headline, "Arrived at Stop 2 · Indian Oil");
  assert.equal(guidance.detail, "Ride on to head to Kodaikanal Lake");
  assert.equal(guidance.distanceMeters, null);
});

test("covers the states around the ride", () => {
  assert.equal(buildGuidance(riding({ rideState: "NOT_STARTED" })).headline, "Route preview");
  assert.equal(buildGuidance(riding({ isPlaced: false })).headline, "Finding your position");
  assert.equal(buildGuidance(riding({ leg: null })).headline, "Head to Stop 2 · Indian Oil");
  assert.equal(
    buildGuidance(riding({ phase: "FINISHED", target: destination })).detail,
    "You've reached Kodaikanal Lake",
  );
});
