import test from "node:test";
import assert from "node:assert/strict";
import {
  autoFinishRemainingMs,
  describeUnfinishedRider,
  isFinishedProgress,
  previewFinishReason,
  progressLabel,
} from "./riderProgress";

const NOW = 1_757_592_000_000;
const clock = (epochMs: number): string => `@${(epochMs - NOW) / 60_000}m`;

test("a rider riding and online reads as riding", () => {
  assert.equal(progressLabel({ progress: "riding", finishedAt: null, isOnline: true }, clock), "Riding");
});

test("a rider riding whose phone went quiet reads as offline", () => {
  assert.equal(progressLabel({ progress: "riding", finishedAt: null, isOnline: false }, clock), "Offline");
});

test("finished riders read the same to everyone, whether or not they are online", () => {
  const finishedAt = new Date(NOW + 5 * 60_000).toISOString();

  assert.equal(progressLabel({ progress: "arrived", finishedAt, isOnline: false }, clock), "Arrived @5m");
  assert.equal(progressLabel({ progress: "left_early", finishedAt, isOnline: true }, clock), "Left early");
  assert.equal(progressLabel({ progress: "group_ended", finishedAt, isOnline: false }, clock), "Ended by captain");
});

test("a rider who has not set off reads as not started", () => {
  assert.equal(progressLabel({ progress: "not_started", finishedAt: null, isOnline: true }, clock), "Not started");
});

test("only arrived, left early and ended by captain are finished", () => {
  assert.equal(isFinishedProgress("arrived"), true);
  assert.equal(isFinishedProgress("left_early"), true);
  assert.equal(isFinishedProgress("group_ended"), true);
  assert.equal(isFinishedProgress("riding"), false);
  assert.equal(isFinishedProgress("not_started"), false);
});

test("previews a finish near the destination, or after arriving, as arrived", () => {
  assert.equal(previewFinishReason({ distanceToDestinationMeters: 90, hasArrived: false }), "arrived");
  assert.equal(previewFinishReason({ distanceToDestinationMeters: 260, hasArrived: true }), "arrived");
  assert.equal(previewFinishReason({ distanceToDestinationMeters: null, hasArrived: false }), "arrived");
});

test("previews a finish away from the destination as leaving early", () => {
  assert.equal(previewFinishReason({ distanceToDestinationMeters: 4_200, hasArrived: false }), "left_early");
});

test("describes riders still out for the captain", () => {
  const base = { displayName: "Ravi", lastHeartbeatAt: new Date(NOW - 60_000).toISOString() };

  assert.equal(
    describeUnfinishedRider({ ...base, isOnline: true, distanceToDestinationMeters: 4_200 }, NOW),
    "Ravi — 4.2 km away",
  );
  assert.equal(
    describeUnfinishedRider(
      { ...base, isOnline: false, lastHeartbeatAt: new Date(NOW - 6 * 60_000).toISOString(), distanceToDestinationMeters: 4_200 },
      NOW,
    ),
    "Ravi — offline 6 min, last seen 4.2 km away",
  );
  assert.equal(
    describeUnfinishedRider({ ...base, isOnline: true, distanceToDestinationMeters: null }, NOW),
    "Ravi — still riding",
  );
});

test("counts down to the auto-finish, never below zero", () => {
  assert.equal(autoFinishRemainingMs(NOW, 600_000, NOW + 60_000), 540_000);
  assert.equal(autoFinishRemainingMs(NOW, 600_000, NOW + 900_000), 0);
});
