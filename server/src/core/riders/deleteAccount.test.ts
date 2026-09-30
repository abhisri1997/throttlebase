import test from "node:test";
import assert from "node:assert/strict";
import { buildHarness, testContext, type Harness } from "../testing/harness.js";
import { AuthError, type AuthErrorCode } from "../auth/errors.js";
import { deleteAccount, requestDeletionCode } from "./deleteAccount.js";

const RIDER = "rider-1";
const ADDRESS = "ada@example.com";
const CODE = "123456";

const seedAda = (h: Harness, email: string | null = ADDRESS) => {
  h.riders.seedRider({ id: RIDER, username: "ada", email, displayName: "Ada" });
  h.riders.seedIdentity("google", "sub-1", RIDER);
};

const requestCode = async (h: Harness, code = CODE) => {
  h.random.scriptedDigits = [code];
  return await requestDeletionCode(h, { riderId: RIDER, ctx: testContext() });
};

const rejectsWith = (code: AuthErrorCode) => (error: unknown) =>
  error instanceof AuthError && error.code === code;

const isDeleted = (h: Harness) =>
  h.riders.state.riders.find((r) => r.id === RIDER)?.deletedAt != null;

test("sends a deletion code to the rider's own address", async () => {
  // Arrange
  const h = buildHarness();
  seedAda(h);

  // Act
  const result = await requestCode(h);

  // Assert
  assert.equal(result.expiresInSeconds, h.policy.otpTtlSeconds);
  assert.equal(h.email.last?.to, ADDRESS);
  assert.equal(h.email.last?.subject, `${CODE} is your code to delete your ThrottleBase account`);
  assert.match(h.email.last?.text ?? "", /nothing is deleted without it/i);
  assert.doesNotMatch(h.email.last?.html ?? "", /<a |<img /);
  assert.equal(h.otps.records[0]?.codeHash, h.hasher.sha256Hex(CODE));
});

test("normalises a mixed-case address on file before storing the code", async () => {
  const h = buildHarness();
  seedAda(h, "Ada@Example.com");

  await requestCode(h);

  assert.equal(h.otps.records[0]?.email, ADDRESS);
});

test("refuses to send a code when there is no address on file", async () => {
  const h = buildHarness();
  seedAda(h, null);

  await assert.rejects(() => requestCode(h), rejectsWith("NO_EMAIL_ON_FILE"));
  assert.equal(h.email.sent.length, 0);
});

test("refuses to send a code for an unknown or deleted rider", async () => {
  const h = buildHarness();

  await assert.rejects(() => requestCode(h), rejectsWith("RIDER_NOT_FOUND"));
});

test("rate-limits deletion codes per address", async () => {
  // Arrange: the short window allows three codes
  const h = buildHarness();
  seedAda(h);
  await requestCode(h, "111111");
  await requestCode(h, "222222");
  await requestCode(h, "333333");

  // Act + Assert
  await assert.rejects(() => requestCode(h, "444444"), rejectsWith("RATE_LIMITED"));
});

test("deletes the account with a valid code: identities unlinked, sessions revoked, code spent", async () => {
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
  await deleteAccount(h, { riderId: RIDER, code: ` ${CODE} ` });

  // Assert
  const rider = h.riders.state.riders[0];
  assert.ok(rider?.deletedAt, "rider row is retained but soft-deleted");
  assert.equal(rider?.email, null);
  assert.equal(h.riders.state.identities.length, 0);
  assert.ok(h.sessions.rows.every((r) => r.revokedAt !== null));
  assert.ok(h.otps.records[0]?.consumedAt, "the code cannot be used twice");
});

test("refuses to delete without a code", async () => {
  const h = buildHarness();
  seedAda(h);

  await assert.rejects(
    () => deleteAccount(h, { riderId: RIDER, code: null }),
    rejectsWith("REAUTH_REQUIRED"),
  );
  assert.equal(isDeleted(h), false);
});

test("refuses to delete with a wrong code and counts the attempt", async () => {
  const h = buildHarness();
  seedAda(h);
  await requestCode(h);

  await assert.rejects(
    () => deleteAccount(h, { riderId: RIDER, code: "999999" }),
    rejectsWith("OTP_INVALID"),
  );
  assert.equal(isDeleted(h), false);
  assert.equal(h.otps.records[0]?.attempts, 1);
});

test("refuses to delete with an expired code", async () => {
  const h = buildHarness();
  seedAda(h);
  await requestCode(h);
  h.clock.advanceSeconds(h.policy.otpTtlSeconds + 1);

  await assert.rejects(
    () => deleteAccount(h, { riderId: RIDER, code: CODE }),
    rejectsWith("OTP_EXPIRED"),
  );
  assert.equal(isDeleted(h), false);
});

test("burns the code after too many wrong attempts, even if the right one follows", async () => {
  // Arrange
  const h = buildHarness();
  seedAda(h);
  await requestCode(h);
  for (let i = 0; i < h.policy.otpMaxAttempts; i += 1) {
    await assert.rejects(() => deleteAccount(h, { riderId: RIDER, code: "000000" }));
  }

  // Act + Assert
  await assert.rejects(
    () => deleteAccount(h, { riderId: RIDER, code: CODE }),
    rejectsWith("OTP_ATTEMPTS_EXCEEDED"),
  );
  assert.equal(isDeleted(h), false);
});

test("a code sent to another address does not delete this account", async () => {
  // Arrange: Bob holds a live code for his own address
  const h = buildHarness();
  seedAda(h);
  h.riders.seedRider({ id: "rider-2", email: "bob@example.com" });
  h.random.scriptedDigits = [CODE];
  await requestDeletionCode(h, { riderId: "rider-2", ctx: testContext() });

  // Act + Assert
  await assert.rejects(
    () => deleteAccount(h, { riderId: RIDER, code: CODE }),
    rejectsWith("OTP_INVALID"),
  );
  assert.equal(isDeleted(h), false);
});

test("deleting an unknown or already-deleted account reports not found", async () => {
  const h = buildHarness();

  await assert.rejects(
    () => deleteAccount(h, { riderId: "rider-missing", code: CODE }),
    rejectsWith("RIDER_NOT_FOUND"),
  );
});
