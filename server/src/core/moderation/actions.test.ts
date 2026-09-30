import test from "node:test";
import assert from "node:assert/strict";
import { noticeFor, refuseAction, reportStatusAfter, type ActionContext } from "./actions.js";

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  targetType: "post",
  ownerId: "rider-1",
  ownerSuspended: false,
  moderatorId: "moderator-1",
  ...overrides,
});

const REASON = "Harassing another rider";

test("posts, comments and routes can be removed; rides, riders and groups can't", () => {
  for (const targetType of ["post", "comment", "route"] as const) {
    assert.equal(refuseAction("remove", context({ targetType }), REASON), null, targetType);
  }
  for (const targetType of ["ride", "rider", "group"] as const) {
    assert.equal(refuseAction("remove", context({ targetType }), REASON), "not_removable", targetType);
  }
});

test("every action needs a real reason", () => {
  assert.equal(refuseAction("dismiss", context(), "   "), "reason_required");
  assert.equal(refuseAction("dismiss", context(), "ok"), "reason_required");
  assert.equal(refuseAction("dismiss", context(), "Not against the guidelines"), null);
});

test("suspending needs someone to suspend, other than the moderator, not already suspended", () => {
  assert.equal(refuseAction("suspend", context(), REASON), null);
  assert.equal(refuseAction("suspend", context({ ownerId: null }), REASON), "no_owner");
  assert.equal(refuseAction("suspend", context({ ownerId: "moderator-1" }), REASON), "own_account");
  assert.equal(refuseAction("suspend", context({ ownerSuspended: true }), REASON), "already_suspended");
});

test("a suspension can only be lifted while there is one", () => {
  assert.equal(refuseAction("lift_suspension", context({ ownerSuspended: true }), REASON), null);
  assert.equal(refuseAction("lift_suspension", context(), REASON), "not_suspended");
});

test("the rider is told what was removed and why, and how to appeal", () => {
  const notice = noticeFor("remove", "comment", " Hate speech ");
  assert.equal(notice?.title, "Your comment was removed");
  assert.match(notice!.body, /Community Guidelines: Hate speech\./);
  assert.match(notice!.body, /Grievance Officer/);
});

test("a suspension and its lifting are told; a dismissal isn't", () => {
  assert.equal(noticeFor("suspend", "rider", REASON)?.title, "Your account is suspended");
  assert.equal(noticeFor("lift_suspension", "rider", REASON)?.title, "Your account is active again");
  assert.equal(noticeFor("dismiss", "post", REASON), null);
});

test("dismissing dismisses the reports, acting actions them, lifting leaves them", () => {
  assert.equal(reportStatusAfter("dismiss"), "dismissed");
  assert.equal(reportStatusAfter("remove"), "actioned");
  assert.equal(reportStatusAfter("suspend"), "actioned");
  assert.equal(reportStatusAfter("lift_suspension"), null);
});
