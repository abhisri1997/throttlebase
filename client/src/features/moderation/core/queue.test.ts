import test from "node:test";
import assert from "node:assert/strict";
import { actionLabel, actionsFor, canConfirmReason, reportSummary, type QueueItem } from "./queue";

const item = (overrides: Partial<QueueItem> = {}): QueueItem => ({
  target_type: "post",
  target_id: "post-1",
  preview: "A post",
  removed: false,
  owner_id: "bala",
  owner_name: "Bala",
  owner_suspended: false,
  report_count: 2,
  reasons: ["harassment", "hate"],
  notes: [],
  first_reported_at: "2026-09-30T10:00:00.000Z",
  last_reported_at: "2026-09-30T11:00:00.000Z",
  ...overrides,
});

test("a reported post can be removed, its author suspended, or the reports dismissed", () => {
  assert.deepEqual(actionsFor(item(), "moderator"), ["remove", "suspend", "dismiss"]);
});

test("rides, riders and groups aren't removed on their own", () => {
  for (const target_type of ["ride", "rider", "group"] as const) {
    assert.deepEqual(actionsFor(item({ target_type }), "moderator"), ["suspend", "dismiss"], target_type);
  }
});

test("something already removed isn't offered for removal again", () => {
  assert.deepEqual(actionsFor(item({ removed: true }), "moderator"), ["suspend", "dismiss"]);
});

test("a suspended maker can have the suspension lifted instead", () => {
  assert.deepEqual(actionsFor(item({ owner_suspended: true }), "moderator"), ["remove", "lift_suspension", "dismiss"]);
});

test("nobody to suspend: a kept community route, or the moderator's own content", () => {
  assert.deepEqual(actionsFor(item({ target_type: "route", owner_id: null, owner_name: null }), "moderator"), [
    "remove",
    "dismiss",
  ]);
  assert.deepEqual(actionsFor(item({ owner_id: "moderator" }), "moderator"), ["remove", "dismiss"]);
});

test("labels name what is acted on", () => {
  assert.equal(actionLabel("remove", item({ target_type: "comment" })), "Remove comment");
  assert.equal(actionLabel("suspend", item()), "Suspend Bala");
});

test("a reason needs a few words", () => {
  assert.equal(canConfirmReason("  ok "), false);
  assert.equal(canConfirmReason("Hate speech"), true);
});

test("the summary counts reports and names the reasons", () => {
  assert.equal(reportSummary(item()), "2 reports · harassment, hate");
  assert.equal(reportSummary(item({ report_count: 1, reasons: ["dangerous_riding"] })), "1 report · dangerous riding");
});
