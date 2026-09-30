import test from "node:test";
import assert from "node:assert/strict";
import { canLeaveRide, isSoloRide, participationHeadline, rideRoleOf, soloRideNote } from "./rideParty";

const CAPTAIN = "cap";
const captainOnly = [{ rider_id: CAPTAIN, role: "captain" }];
const group = [...captainOnly, { rider_id: "asha", role: "rider" }, { rider_id: "bala", role: "co_captain" }];

test("a ride only the captain is on is a solo ride", () => {
  assert.equal(isSoloRide(captainOnly, CAPTAIN), true);
  assert.equal(isSoloRide([], CAPTAIN), true);
  assert.equal(isSoloRide(undefined, CAPTAIN), true);
  assert.equal(isSoloRide(group, CAPTAIN), false);
});

test("each rider's role on the ride", () => {
  assert.equal(rideRoleOf(group, CAPTAIN, CAPTAIN), "captain");
  assert.equal(rideRoleOf(group, CAPTAIN, "bala"), "co_captain");
  assert.equal(rideRoleOf(group, CAPTAIN, "asha"), "rider");
  assert.equal(rideRoleOf(group, CAPTAIN, "someone-else"), null);
  assert.equal(rideRoleOf(group, CAPTAIN, undefined), null);
});

test("the banner speaks to the rider in their role", () => {
  assert.equal(participationHeadline("captain", true), "Your solo ride");
  assert.equal(participationHeadline("captain", false), "You're leading this ride");
  assert.equal(participationHeadline("co_captain", false), "You're co-leading this ride");
  assert.match(participationHeadline("rider", false), /You're riding/);
});

test("a solo captain is told others can still join, unless the ride is full", () => {
  assert.match(soloRideNote("public", false) ?? "", /Other riders can still join/);
  assert.match(soloRideNote("private", false) ?? "", /Riders you invite/);
  assert.equal(soloRideNote("public", true), null);
});

test("a solo captain can't leave their own ride, and nobody leaves once it is under way", () => {
  assert.equal(canLeaveRide("captain", true, "scheduled"), false);
  assert.equal(canLeaveRide("captain", false, "scheduled"), true);
  assert.equal(canLeaveRide("rider", false, "scheduled"), true);
  assert.equal(canLeaveRide("rider", false, "active"), false);
});
