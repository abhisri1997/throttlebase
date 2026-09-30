import test from "node:test";
import assert from "node:assert/strict";
import { isOverdue, outcomeFor, reportReference, resolveDueAt } from "./grievance.js";

const RECEIVED = new Date("2026-09-30T10:00:00.000Z");

test("most reports are due in 7 days", () => {
  assert.equal(resolveDueAt(RECEIVED, "harassment").toISOString(), "2026-10-07T10:00:00.000Z");
});

test("sexual content is due in 72 hours", () => {
  assert.equal(resolveDueAt(RECEIVED, "sexual").toISOString(), "2026-10-03T10:00:00.000Z");
});

test("the reference is short, upper case and comes from the id", () => {
  assert.equal(reportReference("1a2b3c4d-0000-0000-0000-000000000000"), "R-1A2B3C4D");
});

test("the reporter is told where their report stands", () => {
  assert.match(outcomeFor("open"), /reviewing/);
  assert.match(outcomeFor("actioned"), /took action/);
  assert.match(outcomeFor("dismissed"), /didn't break/);
});

test("only an open report past its deadline is overdue", () => {
  const due = new Date("2026-10-07T10:00:00.000Z");
  assert.equal(isOverdue("open", due, new Date("2026-10-07T10:00:01.000Z")), true);
  assert.equal(isOverdue("open", due, new Date("2026-10-07T09:59:59.000Z")), false);
  assert.equal(isOverdue("actioned", due, new Date("2026-10-08T00:00:00.000Z")), false);
});
