import test from "node:test";
import assert from "node:assert/strict";
import {
  alertAgeLabel,
  alertPosition,
  alertToShow,
  directionsUrl,
  EMERGENCY_DIAL_URL,
  GROUP_ALERT_DISCLAIMER,
  GROUP_ALERT_SHOW_FOR_MS,
  type AlertIncident,
} from "./groupAlert";

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const minutesAgo = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

const alert = (overrides: Partial<AlertIncident> = {}): AlertIncident => ({
  incidentId: "incident-1",
  riderId: "asha",
  kind: "group_alert",
  createdAt: minutesAgo(1),
  ...overrides,
});

test("the newest group alert from another rider is shown", () => {
  const older = alert({ incidentId: "old", createdAt: minutesAgo(5) });
  const newer = alert({ incidentId: "new", riderId: "ravi", createdAt: minutesAgo(1) });

  assert.equal(alertToShow([older, newer], "me", new Set(), NOW)?.incidentId, "new");
});

test("a rider does not get their own alert put in front of them", () => {
  assert.equal(alertToShow([alert({ riderId: "me" })], "me", new Set(), NOW), null);
});

test("a dismissed alert stays dismissed", () => {
  assert.equal(alertToShow([alert()], "me", new Set(["incident-1"]), NOW), null);
});

test("other incident kinds are not group alerts, but an old build's 'sos' is", () => {
  assert.equal(alertToShow([alert({ kind: "mechanical" })], "me", new Set(), NOW), null);
  assert.equal(alertToShow([alert({ kind: "sos" })], "me", new Set(), NOW)?.incidentId, "incident-1");
});

test("an alert older than half an hour is no longer shown", () => {
  const stale = alert({ createdAt: new Date(NOW - GROUP_ALERT_SHOW_FOR_MS - 1).toISOString() });
  assert.equal(alertToShow([stale], "me", new Set(), NOW), null);
});

test("navigation goes to the rider's live position, else where they raised the alert", () => {
  const raisedAt = alert({ lat: 12.9, lon: 77.6 });

  assert.deepEqual(alertPosition(raisedAt, { lat: 12.95, lon: 77.65 }), { lat: 12.95, lon: 77.65 });
  assert.deepEqual(alertPosition(raisedAt, null), { lat: 12.9, lon: 77.6 });
  assert.equal(alertPosition(alert(), null), null);
});

test("directions open Google Maps at the rider", () => {
  assert.equal(
    directionsUrl({ lat: 12.9, lon: 77.6 }),
    "https://www.google.com/maps/dir/?api=1&destination=12.900000,77.600000&travelmode=driving",
  );
});

test("112 opens the dialer; the app never places the call", () => {
  assert.equal(EMERGENCY_DIAL_URL, "tel:112");
});

test("the disclaimer says what the alert is not, and never says SOS", () => {
  assert.match(GROUP_ALERT_DISCLAIMER, /not an emergency service/);
  assert.match(GROUP_ALERT_DISCLAIMER, /call 112/);
  assert.doesNotMatch(GROUP_ALERT_DISCLAIMER, /\bsos\b/i);
});

test("the alert's age reads naturally", () => {
  assert.equal(alertAgeLabel(minutesAgo(0.5), NOW), "just now");
  assert.equal(alertAgeLabel(minutesAgo(4), NOW), "4 min ago");
});
