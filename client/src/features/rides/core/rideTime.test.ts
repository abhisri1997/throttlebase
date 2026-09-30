import test from "node:test";
import assert from "node:assert/strict";
import { rideTimeLabel, rideTimeOf } from "./rideTime";

const SCHEDULED = "2026-10-01T02:00:00+05:30";
const STARTED = "2026-10-01T01:50:00+05:30";
const iso = (date: Date) => date.toISOString();

test("a ride that has started shows when it actually started", () => {
  const time = rideTimeOf({ scheduled_at: SCHEDULED, actual_started_at: STARTED });
  assert.equal(time.isActual, true);
  assert.equal(iso(time.at), new Date(STARTED).toISOString());
  assert.equal(rideTimeLabel({ scheduled_at: SCHEDULED, actual_started_at: STARTED }, iso), `Started ${new Date(STARTED).toISOString()}`);
});

test("a ride not yet started, or from an older server, shows its scheduled time", () => {
  for (const ride of [{ scheduled_at: SCHEDULED }, { scheduled_at: SCHEDULED, actual_started_at: null }]) {
    const time = rideTimeOf(ride);
    assert.equal(time.isActual, false);
    assert.equal(rideTimeLabel(ride, iso), new Date(SCHEDULED).toISOString());
  }
});
