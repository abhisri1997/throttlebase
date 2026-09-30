import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReportRequest,
  canSubmitReport,
  MAX_REPORT_NOTE_LENGTH,
  REPORT_REASONS,
  reportConfirmation,
  reportTitle,
  type ReportTarget,
} from "./report";

const post: ReportTarget = { type: "post", id: "post-1", ownerName: "Ezra" };

test("the sheet offers every reason the server accepts, once each", () => {
  assert.deepEqual(
    REPORT_REASONS.map((entry) => entry.reason).sort(),
    ["dangerous_riding", "harassment", "hate", "impersonation", "other", "sexual", "spam", "violence"],
  );
});

test("the title names a rider, and says what else is being reported", () => {
  assert.equal(reportTitle({ type: "rider", id: "r", ownerName: "Ezra" }), "Report Ezra");
  assert.equal(reportTitle(post), "Report this post");
  assert.equal(reportTitle({ type: "route", id: "r", ownerName: null }), "Report this route");
});

test("the request leaves out an empty note and a block nobody asked for", () => {
  assert.deepEqual(buildReportRequest(post, "spam", "   ", false), {
    target_type: "post",
    target_id: "post-1",
    reason: "spam",
  });
});

test("the note is trimmed and capped, and the block goes along when asked", () => {
  const request = buildReportRequest(post, "harassment", `  ${"x".repeat(1500)}  `, true);
  assert.equal(request.note?.length, MAX_REPORT_NOTE_LENGTH);
  assert.equal(request.also_block, true);
});

test("there is nobody to block on something without an owner", () => {
  const kept = buildReportRequest({ type: "route", id: "r", ownerName: null }, "spam", "", true);
  assert.equal("also_block" in kept, false);
});

test("a reason is needed, and 'Something else' needs a note", () => {
  assert.equal(canSubmitReport(null, "anything"), false);
  assert.equal(canSubmitReport("spam", ""), true);
  assert.equal(canSubmitReport("other", " "), false);
  assert.equal(canSubmitReport("other", "Selling stolen parts"), true);
});

test("the confirmation says what happens next", () => {
  assert.match(reportConfirmation(false, false), /within 24 hours/);
  assert.match(reportConfirmation(true, false), /already reported/);
  assert.match(reportConfirmation(false, true), /also blocked/);
});
