import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegistrationRecord,
  purgeAfter,
  REGISTRATION_RETENTION_DAYS,
} from "./registrationRecord.js";

const cancelledAt = new Date("2026-10-01T10:00:00.000Z");

test("a sealed record is kept 180 days after the account is cancelled", () => {
  assert.equal(REGISTRATION_RETENTION_DAYS, 180);
  assert.equal(purgeAfter(cancelledAt).toISOString(), "2027-03-30T10:00:00.000Z");
});

test("the record holds registration details only", () => {
  const record = buildRegistrationRecord({
    riderId: "r1",
    email: "asha@example.test",
    displayName: "Asha",
    username: "asha",
    phoneNumber: "+910000000000",
    registeredAt: new Date("2026-01-02T03:04:05.000Z"),
    identities: [{ provider: "google", subject: "g-123", email: "asha@example.test" }],
    firstConsent: { ip: "203.0.113.7", acceptedAt: new Date("2026-01-02T03:04:06.000Z") },
    cancelledAt,
  });

  assert.deepEqual(record, {
    rider_id: "r1",
    email: "asha@example.test",
    display_name: "Asha",
    username: "asha",
    phone_number: "+910000000000",
    registered_at: "2026-01-02T03:04:05.000Z",
    sign_in_methods: [{ provider: "google", subject: "g-123", email: "asha@example.test" }],
    sign_up_ip: "203.0.113.7",
    sign_up_at: "2026-01-02T03:04:06.000Z",
    cancelled_at: "2026-10-01T10:00:00.000Z",
  });
});

test("details a rider never gave are recorded as missing, not invented", () => {
  const record = buildRegistrationRecord({
    riderId: "r2",
    email: null,
    displayName: "Rider",
    username: null,
    phoneNumber: null,
    registeredAt: new Date("2026-01-02T03:04:05.000Z"),
    identities: [],
    firstConsent: null,
    cancelledAt,
  });

  assert.equal(record.email, null);
  assert.equal(record.sign_up_ip, null);
  assert.equal(record.sign_up_at, null);
  assert.deepEqual(record.sign_in_methods, []);
});
