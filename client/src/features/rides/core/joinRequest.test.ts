import test from "node:test";
import assert from "node:assert/strict";
import { declinePrompt, isRidePreview, joinedMessage, requestAction } from "./joinRequest";

test("a ride the rider may only preview is told apart from a full ride", () => {
  assert.equal(isRidePreview({ id: "r1", is_preview: true }), true);
  assert.equal(isRidePreview({ id: "r1" }), false);
  assert.equal(isRidePreview(null), false);
});

test("a rider who hasn't asked can request to join", () => {
  const action = requestAction({ status: "none", can_request: true });
  assert.equal(action.kind, "request");
  assert.equal(action.label, "Request to join");
  assert.match(action.note, /meeting point and route/);
});

test("a rider waiting on an answer can withdraw their request", () => {
  const action = requestAction({ status: "requested", can_request: false });
  assert.equal(action.kind, "cancel");
  assert.equal(action.label, "Withdraw request");
  assert.match(action.note, /notified/);
});

test("a rider declined once may ask once more", () => {
  const action = requestAction({ status: "declined", can_request: true });
  assert.equal(action.kind, "request");
  assert.equal(action.label, "Ask again");
  assert.match(action.note, /once more/);
});

test("a rider declined twice can't ask again", () => {
  const declined = requestAction({ status: "declined", can_request: false });
  assert.equal(declined.kind, "none");
  assert.doesNotMatch(declined.note, /once more/);

  // Withdrew after the second decline.
  const withdrawn = requestAction({ status: "none", can_request: false });
  assert.equal(withdrawn.kind, "none");
});

test("joining and asking are confirmed differently", () => {
  assert.equal(joinedMessage("joined"), "You have joined the ride!");
  assert.match(joinedMessage("requested"), /Request sent/);
});

test("declining a first request tells the leader the rider can ask once more", () => {
  const prompt = declinePrompt({ display_name: "Asha", decline_count: 0 });
  assert.equal(prompt.title, "Decline Asha?");
  assert.match(prompt.message, /can ask once more/);
  assert.equal(prompt.confirmLabel, "Decline");
});

test("declining a second request warns that it's final", () => {
  const prompt = declinePrompt({ display_name: "Asha", decline_count: 1 });
  assert.match(prompt.message, /won't be able to ask again/);
});
