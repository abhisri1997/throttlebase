import test from "node:test";
import assert from "node:assert/strict";
import { reportHeadline, reportTimeline, type MyReport } from "./myReports";

const report = (overrides: Partial<MyReport> = {}): MyReport => ({
  id: "1a2b3c4d-0000-0000-0000-000000000000",
  reference: "R-1A2B3C4D",
  target_type: "post",
  reason: "harassment",
  status: "open",
  outcome: "We're reviewing it.",
  created_at: "2026-09-30T10:00:00.000Z",
  resolve_due_at: "2026-10-07T10:00:00.000Z",
  resolved_at: null,
  overdue: false,
  ...overrides,
});

test("the headline says what was reported and why", () => {
  assert.equal(reportHeadline(report()), "A post · Harassment or bullying");
  assert.equal(reportHeadline(report({ target_type: "route", reason: "dangerous_riding" })), "A route · Dangerous riding");
});

test("an open report says when it's due", () => {
  assert.match(reportTimeline(report()), /^Due by /);
});

test("an overdue report says so, and where to go", () => {
  assert.match(reportTimeline(report({ overdue: true })), /Grievance Officer/);
});

test("a resolved report says when", () => {
  assert.match(reportTimeline(report({ status: "dismissed", resolved_at: "2026-10-01T10:00:00.000Z" })), /^Resolved /);
});
