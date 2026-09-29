import test from "node:test";
import assert from "node:assert/strict";
import {
  incidentReportedCopy,
  incidentUnacknowledgedCopy,
  normalizeIncidentKind,
} from "./incidentCopy.js";

test("an old build's 'sos' is stored as a group alert", () => {
  assert.equal(normalizeIncidentKind("sos"), "group_alert");
  assert.equal(normalizeIncidentKind("group_alert"), "group_alert");
  assert.equal(normalizeIncidentKind("mechanical"), "mechanical");
});

test("a group alert tells the group who sent it, and never says SOS or emergency", () => {
  const copy = incidentReportedCopy({
    kind: "group_alert",
    severity: "critical",
    reporterName: "Asha",
    rideTitle: "Nandi Hills",
  });

  assert.equal(copy.title, "Group alert");
  assert.match(copy.body, /^Asha sent a group alert on Nandi Hills\./);
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /sos|emergency/i);
});

test("a legacy 'sos' incident gets the group alert wording too", () => {
  const copy = incidentReportedCopy({ kind: "sos", severity: "critical" });
  assert.equal(copy.title, "Group alert");
  assert.match(copy.body, /^A rider sent a group alert on the ride\./);
});

test("an unanswered group alert asks leaders to look, without SOS wording", () => {
  const copy = incidentUnacknowledgedCopy({
    kind: "group_alert",
    severity: "critical",
    rideTitle: "Nandi Hills",
  });

  assert.equal(copy.title, "Group alert still unanswered");
  assert.match(copy.body, /Nandi Hills/);
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /sos|emergency/i);
});

test("other incident kinds keep their wording", () => {
  assert.deepEqual(
    incidentReportedCopy({ kind: "mechanical", severity: "high", reporterName: "Ravi", rideTitle: "Coorg" }),
    { title: "High-priority incident reported", body: "Ravi reported a mechanical incident on Coorg." },
  );
  assert.equal(
    incidentUnacknowledgedCopy({ kind: "crash", severity: "critical", rideTitle: "Coorg" }).title,
    "Critical incident needs acknowledgement",
  );
});
