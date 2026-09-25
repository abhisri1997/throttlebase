import test from "node:test";
import assert from "node:assert/strict";
import {
  canStartOwnRide,
  classifyGroupEndFinish,
  classifyManualFinish,
  deriveRiderProgress,
} from "./progress.js";

const ARRIVE_RADIUS_M = 150;
const HOUR_MS = 60 * 60 * 1000;
const SCHEDULED_AT = 1_757_592_000_000;

test("finishing near the destination counts as arrived", () => {
  assert.equal(classifyManualFinish({ distanceToDestinationM: 80, hasArrived: false }, ARRIVE_RADIUS_M), "arrived");
});

test("finishing away from the destination counts as left early", () => {
  assert.equal(classifyManualFinish({ distanceToDestinationM: 4_200, hasArrived: false }, ARRIVE_RADIUS_M), "left_early");
});

test("a rider who arrived and is moving around the venue still finishes as arrived", () => {
  assert.equal(classifyManualFinish({ distanceToDestinationM: 250, hasArrived: true }, ARRIVE_RADIUS_M), "arrived");
});

test("a ride without a known destination or position finishes as arrived", () => {
  assert.equal(classifyManualFinish({ distanceToDestinationM: null, hasArrived: false }, ARRIVE_RADIUS_M), "arrived");
});

test("the captain ending the ride marks riders at the destination as arrived", () => {
  assert.equal(classifyGroupEndFinish({ distanceToDestinationM: 90, hasArrived: false }, ARRIVE_RADIUS_M), "arrived");
  assert.equal(classifyGroupEndFinish({ distanceToDestinationM: 250, hasArrived: true }, ARRIVE_RADIUS_M), "arrived");
});

test("the captain ending the ride marks riders still out as ended by the group", () => {
  assert.equal(classifyGroupEndFinish({ distanceToDestinationM: 3_000, hasArrived: false }, ARRIVE_RADIUS_M), "group_ended");
  assert.equal(classifyGroupEndFinish({ distanceToDestinationM: null, hasArrived: false }, ARRIVE_RADIUS_M), "group_ended");
});

test("a rider can start their own ride within the early-start window", () => {
  const verdict = canStartOwnRide({
    rideStatus: "scheduled",
    scheduledAtMs: SCHEDULED_AT,
    nowMs: SCHEDULED_AT - 30 * 60 * 1000,
    earlyStartWindowMs: HOUR_MS,
  });

  assert.deepEqual(verdict, { isAllowed: true });
});

test("a rider cannot start their ride long before it is scheduled", () => {
  const verdict = canStartOwnRide({
    rideStatus: "scheduled",
    scheduledAtMs: SCHEDULED_AT,
    nowMs: SCHEDULED_AT - 3 * HOUR_MS,
    earlyStartWindowMs: HOUR_MS,
  });

  assert.equal(verdict.isAllowed, false);
});

test("a rider can always start once the ride is under way or past its time", () => {
  const active = canStartOwnRide({
    rideStatus: "active",
    scheduledAtMs: SCHEDULED_AT + 5 * HOUR_MS,
    nowMs: SCHEDULED_AT,
    earlyStartWindowMs: HOUR_MS,
  });
  const late = canStartOwnRide({
    rideStatus: "scheduled",
    scheduledAtMs: SCHEDULED_AT,
    nowMs: SCHEDULED_AT + HOUR_MS,
    earlyStartWindowMs: HOUR_MS,
  });

  assert.deepEqual(active, { isAllowed: true });
  assert.deepEqual(late, { isAllowed: true });
});

test("a completed, cancelled or draft ride cannot be started", () => {
  for (const rideStatus of ["completed", "cancelled", "draft"]) {
    const verdict = canStartOwnRide({
      rideStatus,
      scheduledAtMs: SCHEDULED_AT,
      nowMs: SCHEDULED_AT,
      earlyStartWindowMs: HOUR_MS,
    });
    assert.equal(verdict.isAllowed, false, rideStatus);
  }
});

test("a ride without a scheduled time can be started when it is scheduled", () => {
  const verdict = canStartOwnRide({
    rideStatus: "scheduled",
    scheduledAtMs: null,
    nowMs: SCHEDULED_AT,
    earlyStartWindowMs: HOUR_MS,
  });

  assert.deepEqual(verdict, { isAllowed: true });
});

test("derives each rider's progress from their start and finish", () => {
  assert.equal(deriveRiderProgress({ rideStartedAt: null, finishedAt: null, finishReason: null }), "not_started");
  assert.equal(deriveRiderProgress({ rideStartedAt: "t", finishedAt: null, finishReason: null }), "riding");
  assert.equal(deriveRiderProgress({ rideStartedAt: "t", finishedAt: "t", finishReason: "arrived" }), "arrived");
  assert.equal(deriveRiderProgress({ rideStartedAt: "t", finishedAt: "t", finishReason: "left_early" }), "left_early");
  assert.equal(deriveRiderProgress({ rideStartedAt: "t", finishedAt: "t", finishReason: "group_ended" }), "group_ended");
});
