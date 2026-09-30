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

const PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----";

test("in production, the server won't start without the key that seals registration records", () => {
  assert.throws(
    () => readAuthConfig(baseEnv({ NODE_ENV: "production", SEALED_RECORD_PUBLIC_KEY: undefined })),
    (error: unknown) => error instanceof ConfigError && /SEALED_RECORD_PUBLIC_KEY/.test(error.message),
  );
});

test("the sealing key can be a PEM or its base64 encoding", () => {
  const asPem = readAuthConfig(baseEnv({ NODE_ENV: "production", SEALED_RECORD_PUBLIC_KEY: PUBLIC_KEY }));
  const asBase64 = readAuthConfig(
    baseEnv({ NODE_ENV: "production", SEALED_RECORD_PUBLIC_KEY: Buffer.from(PUBLIC_KEY).toString("base64") }),
  );
  assert.equal(asPem.sealing.publicKeyPem, PUBLIC_KEY);
  assert.equal(asBase64.sealing.publicKeyPem, PUBLIC_KEY);
  assert.throws(
    () => readAuthConfig(baseEnv({ SEALED_RECORD_PUBLIC_KEY: "not a key" })),
    (error: unknown) => error instanceof ConfigError,
  );
});

test("outside production the sealing key may be absent", () => {
  assert.equal(readAuthConfig(baseEnv({ NODE_ENV: "development" })).sealing.publicKeyPem, null);
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
