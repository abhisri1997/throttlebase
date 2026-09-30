import test from "node:test";
import assert from "node:assert/strict";
import {
  ageGate,
  permits,
  ridePurposesToAsk,
  rideSharing,
  statusLine,
  type ConsentOverview,
  type ConsentPurpose,
  type ConsentStatus,
} from "./consent";

const overview = (
  statuses: Partial<Record<ConsentPurpose, ConsentStatus>> = {},
  age: boolean | null = true,
): ConsentOverview => ({
  notices: [],
  consents: Object.entries(statuses).map(([purpose, status]) => ({
    purpose: purpose as ConsentPurpose,
    status: status as ConsentStatus,
    answeredVersion: null,
    updatedAt: null,
  })),
  declarations: { age_18_plus: age },
});

test("before a ride, the rider is asked about what they were never asked or what changed", () => {
  assert.deepEqual(ridePurposesToAsk(overview()), ["live_location_sharing", "ride_recording", "motion_activity"]);
  assert.deepEqual(
    ridePurposesToAsk(
      overview({ live_location_sharing: "granted", ride_recording: "reconsent_required", motion_activity: "withdrawn" }),
    ),
    ["ride_recording"],
  );
});

test("a rider who said no is not asked again on every ride", () => {
  assert.deepEqual(
    ridePurposesToAsk(overview({ live_location_sharing: "withdrawn", ride_recording: "withdrawn", motion_activity: "granted" })),
    [],
  );
});

test("the app's gate matches the server's: never asked keeps features, marketing is opt-in", () => {
  const never = overview();
  assert.equal(permits(never, "live_location_sharing"), true);
  assert.equal(permits(never, "marketing_notifications"), false);
  assert.equal(permits(overview({ live_location_sharing: "withdrawn" }), "live_location_sharing"), false);
  assert.equal(permits(overview({ live_location_sharing: "reconsent_required" }), "live_location_sharing"), false);
});

test("no sharing means no tracking and no motion sensors", () => {
  assert.deepEqual(rideSharing(overview()), { share: true, motion: true });
  assert.deepEqual(rideSharing(overview({ motion_activity: "withdrawn" })), { share: true, motion: false });
  assert.deepEqual(rideSharing(overview({ live_location_sharing: "withdrawn" })), { share: false, motion: false });
});

test("the 18+ gate asks once, closes after a no, and never locks out a rider offline", () => {
  assert.equal(ageGate(undefined, false), "checking");
  assert.equal(ageGate(undefined, true), "ok");
  assert.equal(ageGate(overview({}, null), false), "ask");
  assert.equal(ageGate(overview({}, false), false), "under_18");
  assert.equal(ageGate(overview({}, true), false), "ok");
});

test("each status reads plainly in Settings", () => {
  assert.equal(statusLine("granted"), "On");
  assert.equal(statusLine("withdrawn"), "Off");
  assert.match(statusLine("reconsent_required"), /updated notice/);
  assert.equal(statusLine("not_asked"), "Not asked yet");
});
