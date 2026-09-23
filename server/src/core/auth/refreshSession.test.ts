import test from "node:test";
import assert from "node:assert/strict";
import { buildHarness, testContext } from "../testing/harness.js";
import { AuthError } from "./errors.js";
import { issueSession } from "./issueSession.js";
import { logout, logoutAll } from "./logout.js";
import { refreshSession } from "./refreshSession.js";

const seedLogin = async (h: ReturnType<typeof buildHarness>) => {
  h.riders.seedRider({ id: "rider-1", username: "ada" });
  return await issueSession(h, {
    riderId: "rider-1",
    roles: [],
    ctx: testContext(),
  });
};

test("issues a refresh token that is only ever stored as a digest", async () => {
  // Arrange & Act
  const h = buildHarness();
  const tokens = await seedLogin(h);

  // Assert
  const stored = h.sessions.rows[0];
  assert.equal(h.sessions.rows.length, 1);
  assert.notEqual(stored?.refreshTokenHash, tokens.refreshToken);
  assert.equal(stored?.refreshTokenHash, h.hasher.sha256Hex(tokens.refreshToken));
});

test("rotates the refresh token on every use, keeping the family", async () => {
  // Arrange
  const h = buildHarness();
  const first = await seedLogin(h);

  // Act
  const second = await refreshSession(h, {
    refreshToken: first.refreshToken,
    ctx: testContext(),
  });

  // Assert
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.equal(second.riderId, "rider-1");
  assert.equal(h.sessions.rows.length, 2);
  assert.equal(h.sessions.rows[0]?.familyId, h.sessions.rows[1]?.familyId);
  assert.equal(h.sessions.rows[0]?.replacedBy, h.sessions.rows[1]?.id);
});

test("presenting an already-rotated token revokes the entire family", async () => {
  // Arrange: rotate once, so the first token is spent
  const h = buildHarness();
  const first = await seedLogin(h);
  const second = await refreshSession(h, {
    refreshToken: first.refreshToken,
    ctx: testContext(),
  });

  // Act: replay the spent token, as a thief would
  await assert.rejects(
    () => refreshSession(h, { refreshToken: first.refreshToken, ctx: testContext() }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "REFRESH_TOKEN_REUSED",
  );

  // Assert: the legitimate token is dead too — we cannot tell thief from victim
  assert.ok(h.sessions.rows.every((r) => r.revokedAt !== null));
  await assert.rejects(
    () => refreshSession(h, { refreshToken: second.refreshToken, ctx: testContext() }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "REFRESH_TOKEN_INVALID",
  );
});

test("rejects an unknown refresh token", async () => {
  const h = buildHarness();

  await assert.rejects(
    () => refreshSession(h, { refreshToken: "not-a-token", ctx: testContext() }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "REFRESH_TOKEN_INVALID",
  );
});

test("rejects an expired refresh token", async () => {
  // Arrange
  const h = buildHarness();
  const tokens = await seedLogin(h);

  // Act: step past the 30-day sliding window
  h.clock.advanceSeconds(h.policy.refreshTokenTtlSeconds + 1);

  // Assert
  await assert.rejects(
    () => refreshSession(h, { refreshToken: tokens.refreshToken, ctx: testContext() }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "REFRESH_TOKEN_INVALID",
  );
});

test("a rotated token carries the rider's current roles", async () => {
  // Arrange
  const h = buildHarness();
  const first = await seedLogin(h);
  h.riders.state.roles.push({ riderId: "rider-1", role: "admin" });

  // Act
  await refreshSession(h, { refreshToken: first.refreshToken, ctx: testContext() });

  // Assert: roles are re-read at refresh, not frozen at login
  assert.deepEqual(h.tokenIssuer.issued.at(-1)?.roles, ["admin"]);
});

test("logout revokes the presented token's family only", async () => {
  // Arrange: two separate logins for the same rider
  const h = buildHarness();
  const deviceA = await seedLogin(h);
  const deviceB = await issueSession(h, {
    riderId: "rider-1",
    roles: [],
    ctx: testContext(),
  });

  // Act
  await logout(h, deviceA.refreshToken);

  // Assert
  await assert.rejects(() =>
    refreshSession(h, { refreshToken: deviceA.refreshToken, ctx: testContext() }),
  );
  const stillValid = await refreshSession(h, {
    refreshToken: deviceB.refreshToken,
    ctx: testContext(),
  });
  assert.equal(stillValid.riderId, "rider-1");
});

test("logout on an unknown token is a no-op, not an error", async () => {
  const h = buildHarness();

  const result = await logout(h, "never-issued");

  assert.deepEqual(result, { revoked: 0 });
});

test("logoutAll revokes every family for the rider", async () => {
  // Arrange
  const h = buildHarness();
  const deviceA = await seedLogin(h);
  const deviceB = await issueSession(h, {
    riderId: "rider-1",
    roles: [],
    ctx: testContext(),
  });

  // Act
  const result = await logoutAll(h, "rider-1");

  // Assert
  assert.equal(result.revoked, 2);
  for (const token of [deviceA.refreshToken, deviceB.refreshToken]) {
    await assert.rejects(() =>
      refreshSession(h, { refreshToken: token, ctx: testContext() }),
    );
  }
});
