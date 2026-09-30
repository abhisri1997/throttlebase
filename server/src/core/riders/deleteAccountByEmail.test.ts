import test from "node:test";
import assert from "node:assert/strict";
import { buildHarness, testContext, type Harness } from "../testing/harness.js";
import { AuthError, type AuthErrorCode } from "../auth/errors.js";
import {
  deleteAccountByEmail,
  requestDeletionCodeByEmail,
} from "./deleteAccount.js";

/**
 * The signed-out path behind throttlebase.in/delete-account: an address and
 * the code emailed to it, with no session. See deleteAccount.test.ts for the
 * signed-in path.
 */

const RIDER = "rider-1";
const ADDRESS = "ada@example.com";
const CODE = "123456";

const seedAda = (h: Harness) => {
  h.riders.seedRider({ id: RIDER, username: "ada", email: ADDRESS, displayName: "Ada" });
  h.riders.seedIdentity("google", "sub-1", RIDER);
};

const requestCode = async (h: Harness, email = ADDRESS, code = CODE) => {
  h.random.scriptedDigits = [code];
  return await requestDeletionCodeByEmail(h, { email, ctx: testContext() });
};

const confirm = async (h: Harness, code: string, email = ADDRESS) =>
  await deleteAccountByEmail(h, { email, code, ctx: testContext() });

const rejectsWith = (code: AuthErrorCode) => (error: unknown) =>
  error instanceof AuthError && error.code === code;

const isDeleted = (h: Harness) =>
  h.riders.state.riders.find((r) => r.id === RIDER)?.deletedAt != null;

test("emails a deletion code to an address with an account", async () => {
  const h = buildHarness();
  seedAda(h);

  await requestCode(h, "  Ada@Example.com ");

  assert.equal(h.email.last?.to, ADDRESS);
  assert.equal(h.email.last?.subject, `${CODE} is your code to delete your ThrottleBase account`);
  assert.equal(h.otps.records[0]?.email, ADDRESS);
});

test("tells an address with no account so, without issuing a code", async () => {
  const h = buildHarness();

  await requestCode(h, "nobody@example.com");

  assert.equal(h.email.last?.to, "nobody@example.com");
  assert.match(h.email.last?.text ?? "", /no ThrottleBase account/i);
  assert.doesNotMatch(h.email.last?.text ?? "", /\d{6}/);
  assert.equal(h.otps.records.length, 0);
});

test("answers the same whether or not the address has an account", async () => {
  // Arrange
  const h = buildHarness();
  seedAda(h);

  // Act
  const known = await requestCode(h, ADDRESS);
  const unknown = await requestCode(h, "nobody@example.com");
  const invalid = await requestCode(h, "not-an-email");

  // Assert: no account-existence oracle
  assert.deepEqual(known, unknown);
  assert.deepEqual(known, invalid);
});

test("rate-limits requests per address, account or not", async () => {
  const h = buildHarness();
  for (let i = 0; i < h.policy.otpRateLimits.startPerEmailShort.limit; i += 1) {
    await requestCode(h, "nobody@example.com");
  }

  await assert.rejects(() => requestCode(h, "nobody@example.com"), rejectsWith("RATE_LIMITED"));
});

test("rate-limits requests per IP across addresses", async () => {
  const h = buildHarness({
    otpRateLimits: {
      ...buildHarness().policy.otpRateLimits,
      startPerIp: { limit: 2, windowSeconds: 900 },
    },
  });
  await requestCode(h, "a@example.com");
  await requestCode(h, "b@example.com");

  await assert.rejects(() => requestCode(h, "c@example.com"), rejectsWith("RATE_LIMITED"));
});

test("the emailed code deletes the account: identities unlinked, sessions revoked", async () => {
  // Arrange
  const h = buildHarness();
  seedAda(h);
  await h.sessions.create({
    riderId: RIDER,
    familyId: "family-1",
    refreshTokenHash: "hash",
    expiresAt: new Date("2027-01-01"),
    userAgent: null,
    ipAddress: null,
  });
  await requestCode(h);

  // Act
  const result = await confirm(h, CODE, "ADA@example.com");

  // Assert
  assert.deepEqual(result, { deleted: true });
  assert.equal(isDeleted(h), true);
  assert.equal(h.riders.state.identities.length, 0);
  assert.ok(h.sessions.rows.every((r) => r.revokedAt !== null));
});

test("a wrong code deletes nothing", async () => {
  const h = buildHarness();
  seedAda(h);
  await requestCode(h);

  await assert.rejects(() => confirm(h, "999999"), rejectsWith("OTP_INVALID"));
  assert.equal(isDeleted(h), false);
});

test("an address that never had a code is refused like a wrong code", async () => {
  const h = buildHarness();
  seedAda(h);

  await assert.rejects(() => confirm(h, CODE), rejectsWith("OTP_INVALID"));
  assert.equal(isDeleted(h), false);
});

test("a valid code for an address whose account is already gone reports no account", async () => {
  // Arrange: the account is deleted between asking and confirming
  const h = buildHarness();
  seedAda(h);
  await requestCode(h);
  await h.riders.softDeleteAndUnlink(RIDER, h.clock.now());

  // Act
  const result = await confirm(h, CODE);

  // Assert
  assert.deepEqual(result, { deleted: false });
});

test("rate-limits confirmations per IP", async () => {
  const h = buildHarness({
    otpRateLimits: {
      ...buildHarness().policy.otpRateLimits,
      verifyPerIp: { limit: 1, windowSeconds: 900 },
    },
  });
  seedAda(h);
  await requestCode(h);
  await assert.rejects(() => confirm(h, "999999"), rejectsWith("OTP_INVALID"));

  await assert.rejects(() => confirm(h, CODE), rejectsWith("RATE_LIMITED"));
  assert.equal(isDeleted(h), false);
});
