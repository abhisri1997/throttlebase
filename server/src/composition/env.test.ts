import test from "node:test";
import assert from "node:assert/strict";
import { ConfigError, readAuthConfig, type Env } from "./env.js";

const baseEnv = (overrides: Env = {}): Env => ({
  AUTH_JWT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  AUTH_JWT_KID: "tb-test",
  GOOGLE_CLIENT_IDS: "web.apps.googleusercontent.com,ios.apps.googleusercontent.com",
  TERMS_VERSION: "2026-01-01",
  PRIVACY_VERSION: "2026-01-01",
  ...overrides,
});

test("boots with Google configured and Apple absent", () => {
  // Apple ships after the developer membership exists; until then an
  // unconfigured provider must not stop the server starting.
  const config = readAuthConfig(baseEnv({ APPLE_CLIENT_IDS: undefined }));

  assert.deepEqual(config.apple.allowedAudiences, []);
  assert.equal(config.google.allowedAudiences.length, 2);
});

test("accepts a configured Apple client id list", () => {
  const config = readAuthConfig(
    baseEnv({ APPLE_CLIENT_IDS: "in.throttlebase.rider" }),
  );

  assert.deepEqual(config.apple.allowedAudiences, ["in.throttlebase.rider"]);
});

test("still requires at least one Google client id", () => {
  assert.throws(
    () => readAuthConfig(baseEnv({ GOOGLE_CLIENT_IDS: undefined })),
    (error: unknown) => error instanceof ConfigError,
  );
});

test("requires the signing key and consent versions", () => {
  for (const name of [
    "AUTH_JWT_PRIVATE_KEY",
    "AUTH_JWT_KID",
    "TERMS_VERSION",
    "PRIVACY_VERSION",
  ]) {
    assert.throws(
      () => readAuthConfig(baseEnv({ [name]: undefined })),
      (error: unknown) => error instanceof ConfigError && error.message.includes(name),
      `expected ${name} to be required`,
    );
  }
});

test("trims whitespace around comma-separated client ids", () => {
  const config = readAuthConfig(
    baseEnv({ GOOGLE_CLIENT_IDS: " a.apps , b.apps ,, " }),
  );

  assert.deepEqual(config.google.allowedAudiences, ["a.apps", "b.apps"]);
});

test("applies documented defaults for the token policy", () => {
  const config = readAuthConfig(baseEnv());

  assert.equal(config.policy.accessTokenTtlSeconds, 900);
  assert.equal(config.policy.refreshTokenTtlSeconds, 2_592_000);
  assert.equal(config.policy.otpTtlSeconds, 600);
  assert.equal(config.policy.otpMaxAttempts, 5);
});

test("rejects a non-numeric override rather than silently defaulting", () => {
  assert.throws(
    () => readAuthConfig(baseEnv({ AUTH_OTP_MAX_ATTEMPTS: "five" })),
    (error: unknown) => error instanceof ConfigError,
  );
});
