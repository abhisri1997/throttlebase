import test from "node:test";
import assert from "node:assert/strict";
import { CONSENT_PURPOSES, CURRENT_NOTICES, currentNotices } from "./notices.js";
import { consentStatus, hasCurrentConsent, refuseAnswer, summarizeConsents, type StoredConsent } from "./state.js";

const current = CURRENT_NOTICES.live_location_sharing.version;
const at = new Date("2026-10-02T10:00:00Z");

const stored = (overrides: Partial<StoredConsent> = {}): StoredConsent => ({
  purpose: "live_location_sharing",
  granted: true,
  noticeVersion: current,
  updatedAt: at,
  ...overrides,
});

test("a grant against the current notice counts", () => {
  assert.equal(consentStatus(stored()), "granted");
  assert.equal(hasCurrentConsent(stored()), true);
});

test("never asked is not consent", () => {
  assert.equal(consentStatus(undefined), "not_asked");
  assert.equal(hasCurrentConsent(undefined), false);
});

test("a withdrawal is not consent, whatever version it was given against", () => {
  assert.equal(consentStatus(stored({ granted: false })), "withdrawn");
  assert.equal(hasCurrentConsent(stored({ granted: false, noticeVersion: "2020-01-01" })), false);
});

test("a grant against an older notice needs the new one accepted first", () => {
  const old = stored({ noticeVersion: "2026-01-01" });
  assert.equal(consentStatus(old), "reconsent_required");
  assert.equal(hasCurrentConsent(old), false);
  // And a bump of the current version does the same to a grant that was current.
  assert.equal(consentStatus(stored(), "2027-01-01"), "reconsent_required");
});

test("the summary lists every purpose once, in order, asked or not", () => {
  const summary = summarizeConsents([stored(), stored({ purpose: "public_profile", granted: false })]);
  assert.deepEqual(
    summary.map((row) => row.purpose),
    [...CONSENT_PURPOSES],
  );
  const byPurpose = Object.fromEntries(summary.map((row) => [row.purpose, row.status]));
  assert.equal(byPurpose.live_location_sharing, "granted");
  assert.equal(byPurpose.public_profile, "withdrawn");
  assert.equal(byPurpose.ride_recording, "not_asked");
});

test("an answer to a notice that is not the current one is refused", () => {
  assert.equal(refuseAnswer("ride_recording", CURRENT_NOTICES.ride_recording.version), null);
  assert.equal(refuseAnswer("ride_recording", "2026-01-01"), "stale_notice");
});

test("every purpose has a notice that says how to withdraw", () => {
  for (const notice of currentNotices()) {
    assert.ok(notice.title.length > 0, notice.purpose);
    assert.match(notice.body, /Settings → Privacy/, notice.purpose);
    assert.match(notice.body, /Data Protection Board/, notice.purpose);
  }
});
