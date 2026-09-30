import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { AuthContainer } from "../../composition/container.js";
import type { TokenVerifier } from "../../ports/TokenVerifier.js";
import { buildHarness, type Harness } from "../../core/testing/harness.js";
import { createRiderAccountRoutes } from "./riderAccountRoutes.js";

/**
 * Account deletion over HTTP. The use case is covered against fakes in
 * core/riders/deleteAccount.test.ts; this pins the status codes the app
 * relies on, above all that a refused code is never a 401, which the app
 * would read as an expired token, refresh, and resend the same code.
 */

const RIDER = "rider-1";
const CODE = "123456";

/** Accepts any bearer token as RIDER. */
const acceptingVerifier: TokenVerifier = {
  verifyAccessToken: () =>
    Promise.resolve({ sub: RIDER, iss: "test", aud: "test", iat: 0, exp: 0, roles: [] }),
};

const startServer = async (h: Harness) => {
  const container = { ...h, tokenVerifier: acceptingVerifier } as unknown as AuthContainer;
  const app = express();
  app.use(express.json());
  app.use("/api/riders", createRiderAccountRoutes(container));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  const call = async (method: "POST" | "DELETE", path: string, body?: unknown) =>
    await fetch(`http://127.0.0.1:${port}/api/riders${path}`, {
      method,
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  return { call, close };
};

const withAda = () => {
  const h = buildHarness();
  h.riders.seedRider({ id: RIDER, email: "ada@example.com", username: "ada" });
  h.random.scriptedDigits = [CODE];
  return h;
};

test("DELETE /me without a code is refused with REAUTH_REQUIRED", async () => {
  const h = withAda();
  const server = await startServer(h);

  try {
    const response = await server.call("DELETE", "/me");

    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { code: string }).code, "REAUTH_REQUIRED");
  } finally {
    await server.close();
  }
});

test("a wrong or expired code is a 403, never a 401", async () => {
  // Arrange
  const h = withAda();
  const server = await startServer(h);

  try {
    await server.call("POST", "/me/deletion-code");

    // Act
    const wrong = await server.call("DELETE", "/me", { code: "999999" });
    h.clock.advanceSeconds(h.policy.otpTtlSeconds + 1);
    const expired = await server.call("DELETE", "/me", { code: CODE });

    // Assert
    assert.equal(wrong.status, 403);
    assert.equal(((await wrong.json()) as { code: string }).code, "OTP_INVALID");
    assert.equal(expired.status, 403);
    assert.equal(((await expired.json()) as { code: string }).code, "OTP_EXPIRED");
  } finally {
    await server.close();
  }
});

test("requesting a code then deleting with it answers 202 then 204", async () => {
  const h = withAda();
  const server = await startServer(h);

  try {
    const requested = await server.call("POST", "/me/deletion-code");
    const deleted = await server.call("DELETE", "/me", { code: CODE });

    assert.equal(requested.status, 202);
    assert.deepEqual(await requested.json(), { expiresInSeconds: h.policy.otpTtlSeconds });
    assert.equal(deleted.status, 204);
    assert.ok(h.riders.state.riders[0]?.deletedAt);
  } finally {
    await server.close();
  }
});
