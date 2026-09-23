import test from "node:test";
import assert from "node:assert/strict";
import { buildHarness, testContext } from "../testing/harness.js";
import { AuthError } from "./errors.js";
import { startEmailLogin } from "./startEmailLogin.js";
import { verifyEmailLogin } from "./verifyEmailLogin.js";

const ADDRESS = "rider@example.com";

const start = async (h: ReturnType<typeof buildHarness>, email = ADDRESS) =>
  await startEmailLogin(h, { email, ctx: testContext() });

test("stores only a digest of the code, never the code itself", async () => {
  // Arrange
  const h = buildHarness();
  h.random.scriptedDigits = ["123456"];

  // Act
  await start(h);

  // Assert
  const record = h.otps.records[0];
  assert.equal(h.otps.records.length, 1);
  assert.notEqual(record?.codeHash, "123456");
  assert.equal(record?.codeHash, h.hasher.sha256Hex("123456"));
});

test("emails the code with no links and the code in the subject", async () => {
  const h = buildHarness();
  h.random.scriptedDigits = ["654321"];

  await start(h);

  const mail = h.email.last;
  assert.equal(mail?.subject, "654321 is your ThrottleBase code");
  assert.match(mail?.text ?? "", /654321/);
  assert.doesNotMatch(mail?.text ?? "", /https?:\/\//);
  assert.doesNotMatch(mail?.html ?? "", /<a |<img /);
});

test("returns an identical result for unknown and existing addresses", async () => {
  // Arrange: one address has a rider behind it, the other does not
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-1", email: ADDRESS, username: "ada" });

  // Act
  const known = await start(h, ADDRESS);
  const unknown = await start(h, "nobody@example.com");

  // Assert: no account-existence oracle
  assert.deepEqual(known, unknown);
});

test("accepts an undeliverable address without sending, keeping the result uniform", async () => {
  const h = buildHarness();

  const result = await start(h, "not-an-email");

  assert.equal(result.accepted, true);
  assert.equal(h.email.sent.length, 0);
  assert.equal(h.otps.records.length, 0);
});

test("issuing a new code invalidates the previous one", async () => {
  // Arrange
  const h = buildHarness();
  h.random.scriptedDigits = ["111111", "222222"];
  await start(h);

  // Act
  await start(h);

  // Assert: the old code can no longer be redeemed
  assert.equal(h.otps.records[0]?.consumedAt !== null, true);
  await assert.rejects(
    () => verifyEmailLogin(h, { email: ADDRESS, code: "111111", ctx: testContext() }),
    (error: unknown) => error instanceof AuthError && error.code === "OTP_INVALID",
  );
});

test("rejects a code once it has expired", async () => {
  // Arrange
  const h = buildHarness();
  h.random.scriptedDigits = ["123456"];
  await start(h);

  // Act
  h.clock.advanceSeconds(h.policy.otpTtlSeconds + 1);

  // Assert
  await assert.rejects(
    () => verifyEmailLogin(h, { email: ADDRESS, code: "123456", ctx: testContext() }),
    (error: unknown) => error instanceof AuthError && error.code === "OTP_EXPIRED",
  );
});

test("locks the code after the configured number of wrong attempts", async () => {
  // Arrange
  const h = buildHarness({ otpMaxAttempts: 3 });
  h.random.scriptedDigits = ["123456"];
  await start(h);

  // Act: burn every allowed attempt
  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(
      () => verifyEmailLogin(h, { email: ADDRESS, code: "000000", ctx: testContext() }),
      (error: unknown) => error instanceof AuthError && error.code === "OTP_INVALID",
    );
  }

  // Assert: the next attempt is refused outright, even with the right code
  await assert.rejects(
    () => verifyEmailLogin(h, { email: ADDRESS, code: "123456", ctx: testContext() }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "OTP_ATTEMPTS_EXCEEDED",
  );
});

test("rate limits repeated code requests for one address", async () => {
  // Arrange: the fake allows `limit` calls per bucket
  const h = buildHarness();
  const limit = h.policy.otpRateLimits.startPerEmailShort.limit;

  // Act
  for (let i = 0; i < limit; i += 1) {
    await start(h);
  }

  // Assert
  await assert.rejects(
    () => start(h),
    (error: unknown) =>
      error instanceof AuthError &&
      error.code === "RATE_LIMITED" &&
      typeof error.retryAfterSeconds === "number",
  );
});

test("a correct code creates the rider and returns a session", async () => {
  // Arrange
  const h = buildHarness();
  h.random.scriptedDigits = ["123456"];
  await start(h);

  // Act
  const result = await verifyEmailLogin(h, {
    email: ADDRESS,
    code: "123456",
    ctx: testContext(),
  });

  // Assert
  assert.equal(result.isNewRider, true);
  assert.equal(result.needsOnboarding, true);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  const rider = h.riders.state.riders[0];
  assert.equal(rider?.email, ADDRESS);
  assert.equal(h.sessions.rows.length, 1);
});

test("a redeemed code cannot be used twice", async () => {
  // Arrange
  const h = buildHarness();
  h.random.scriptedDigits = ["123456"];
  await start(h);
  await verifyEmailLogin(h, { email: ADDRESS, code: "123456", ctx: testContext() });

  // Assert
  await assert.rejects(
    () => verifyEmailLogin(h, { email: ADDRESS, code: "123456", ctx: testContext() }),
    (error: unknown) => error instanceof AuthError && error.code === "OTP_INVALID",
  );
});

test("signing in by email links to the rider who already owns that address", async () => {
  // Arrange
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-1", email: ADDRESS, username: "ada" });
  h.random.scriptedDigits = ["123456"];
  await start(h);

  // Act
  const result = await verifyEmailLogin(h, {
    email: ADDRESS,
    code: "123456",
    ctx: testContext(),
  });

  // Assert
  assert.equal(result.riderId, "rider-1");
  assert.equal(result.isNewRider, false);
  assert.equal(result.needsOnboarding, false);
});

test("treats the address case-insensitively end to end", async () => {
  const h = buildHarness();
  h.random.scriptedDigits = ["123456"];
  await startEmailLogin(h, { email: "Rider@Example.COM", ctx: testContext() });

  const result = await verifyEmailLogin(h, {
    email: "rider@example.com",
    code: "123456",
    ctx: testContext(),
  });

  assert.equal(result.isNewRider, true);
  assert.equal(h.email.last?.to, ADDRESS);
});
