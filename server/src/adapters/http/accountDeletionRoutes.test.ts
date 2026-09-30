import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { AuthContainer } from "../../composition/container.js";
import { buildHarness, type Harness } from "../../core/testing/harness.js";
import { createAccountDeletionRoutes } from "./accountDeletionRoutes.js";

/**
 * The public endpoints behind throttlebase.in/delete-account. No session: the
 * code emailed to the address is the only proof. The use cases are covered
 * in core/riders/deleteAccountByEmail.test.ts; this pins the HTTP contract.
 */

const ADDRESS = "ada@example.com";
const CODE = "123456";

const startServer = async (h: Harness) => {
  const app = express();
  app.use(express.json());
  app.use("/api/account-deletion", createAccountDeletionRoutes(h as unknown as AuthContainer));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  const post = async (path: string, body: unknown) =>
    await fetch(`http://127.0.0.1:${port}/api/account-deletion${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  return { post, close };
};

const withAda = () => {
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-1", email: ADDRESS, username: "ada" });
  return h;
};

test("asking for a code answers 202 with the same body, account or not", async () => {
  const h = withAda();
  const server = await startServer(h);

  try {
    const known = await server.post("/code", { email: ADDRESS });
    const unknown = await server.post("/code", { email: "nobody@example.com" });

    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(await known.json(), await unknown.json());
  } finally {
    await server.close();
  }
});

test("confirming with the emailed code deletes the account", async () => {
  // Arrange
  const h = withAda();
  h.random.scriptedDigits = [CODE];
  const server = await startServer(h);

  try {
    await server.post("/code", { email: ADDRESS });

    // Act
    const response = await server.post("/confirm", { email: ADDRESS, code: CODE });

    // Assert
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
    assert.ok(h.riders.state.riders[0]?.deletedAt);
  } finally {
    await server.close();
  }
});

test("a wrong code is refused and deletes nothing", async () => {
  const h = withAda();
  h.random.scriptedDigits = [CODE];
  const server = await startServer(h);

  try {
    await server.post("/code", { email: ADDRESS });

    const response = await server.post("/confirm", { email: ADDRESS, code: "999999" });

    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { code: string }).code, "OTP_INVALID");
    assert.equal(h.riders.state.riders[0]?.deletedAt, null);
  } finally {
    await server.close();
  }
});

test("a request without an email or code is a validation error", async () => {
  const server = await startServer(withAda());

  try {
    assert.equal((await server.post("/code", {})).status, 400);
    assert.equal((await server.post("/confirm", { email: ADDRESS })).status, 400);
  } finally {
    await server.close();
  }
});
