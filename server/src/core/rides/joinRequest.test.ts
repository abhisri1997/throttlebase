import test from "node:test";
import assert from "node:assert/strict";
import { decideJoin, describeMyRequest, MAX_DECLINES } from "./joinRequest.js";

test("anyone joins a public ride at once", () => {
  assert.deepEqual(decideJoin("public", null), { kind: "join" });
});

test("a rider who left a public ride can join it again", () => {
  assert.deepEqual(decideJoin("public", { status: "dropped_out", declineCount: 0 }), { kind: "join" });
});

test("a rider already on the ride is told so, whatever the ride", () => {
  const onRide = { status: "confirmed", declineCount: 0 } as const;
  assert.deepEqual(decideJoin("public", onRide), { kind: "refuse", reason: "already_on_ride" });
  assert.deepEqual(decideJoin("private", onRide), { kind: "refuse", reason: "already_on_ride" });
});

test("a ride that needs approval is asked for, not joined", () => {
  assert.deepEqual(decideJoin("private", null), { kind: "request" });
});

test("asking twice while the first request waits is refused", () => {
  assert.deepEqual(decideJoin("private", { status: "requested", declineCount: 0 }), {
    kind: "refuse",
    reason: "already_requested",
  });
});

test("a declined rider may ask once more, in case the leader declined by mistake", () => {
  assert.deepEqual(decideJoin("private", { status: "rejected", declineCount: 1 }), { kind: "request" });
});

test("after the second decline the rider can't ask again", () => {
  assert.equal(MAX_DECLINES, 2);
  assert.deepEqual(decideJoin("private", { status: "rejected", declineCount: 2 }), {
    kind: "refuse",
    reason: "declined",
  });
});

test("cancelling a request doesn't reset the declines", () => {
  assert.deepEqual(decideJoin("private", { status: "dropped_out", declineCount: 2 }), {
    kind: "refuse",
    reason: "declined",
  });
});

test("the rider's own request reads as none, waiting or declined", () => {
  assert.deepEqual(describeMyRequest(null), { status: "none", can_request: true });
  assert.deepEqual(describeMyRequest({ status: "requested", declineCount: 0 }), {
    status: "requested",
    can_request: false,
  });
  assert.deepEqual(describeMyRequest({ status: "rejected", declineCount: 1 }), {
    status: "declined",
    can_request: true,
  });
  assert.deepEqual(describeMyRequest({ status: "rejected", declineCount: 2 }), {
    status: "declined",
    can_request: false,
  });
  assert.deepEqual(describeMyRequest({ status: "dropped_out", declineCount: 0 }), {
    status: "none",
    can_request: true,
  });
});

test("nobody joins or asks for a solo ride", () => {
  assert.deepEqual(decideJoin("solo", null), { kind: "refuse", reason: "closed" });
  assert.deepEqual(decideJoin("solo", { status: "invited", declineCount: 0 }), { kind: "refuse", reason: "closed" });
});

test("an invite-only ride is joined only by an invited rider", () => {
  assert.deepEqual(decideJoin("invite_only", null), { kind: "refuse", reason: "closed" });
  assert.deepEqual(decideJoin("invite_only", { status: "dropped_out", declineCount: 0 }), { kind: "refuse", reason: "closed" });
  assert.deepEqual(decideJoin("invite_only", { status: "invited", declineCount: 0 }), { kind: "join" });
});
