import test from "node:test";
import assert from "node:assert/strict";
import { createEmailSender, EmailConfigError, type EmailEnv } from "./createEmailSender.js";

const smtpEnv = (overrides: EmailEnv = {}): EmailEnv => ({
  EMAIL_DRIVER: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "apikey",
  SMTP_PASS: "secret",
  MAIL_FROM: "ThrottleBase <no-reply@mail.throttlebase.in>",
  ...overrides,
});

test("defaults to the console driver when EMAIL_DRIVER is unset", () => {
  const sender = createEmailSender({});
  assert.ok(sender);
});

test("refuses the console driver in production", () => {
  assert.throws(
    () => createEmailSender({ NODE_ENV: "production" }),
    (error: unknown) =>
      error instanceof EmailConfigError && /refused in production/i.test(error.message),
  );
});

test("allows the console driver in production only when explicitly overridden", () => {
  // Arrange: the deliberate escape hatch
  const env = { NODE_ENV: "production", ALLOW_CONSOLE_EMAIL: "true" };

  // Act & Assert: boots, and says so loudly
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (msg: unknown) => void warnings.push(String(msg));
  try {
    assert.ok(createEmailSender(env));
  } finally {
    console.warn = original;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /PRODUCTION/);
});

test("the console driver is fine outside production", () => {
  assert.ok(createEmailSender({ NODE_ENV: "development", EMAIL_DRIVER: "console" }));
});

test("builds an SMTP sender when fully configured", () => {
  assert.ok(createEmailSender(smtpEnv()));
});

test("refuses to boot when any SMTP variable is missing", () => {
  for (const missing of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "MAIL_FROM",
  ]) {
    const env = smtpEnv({ [missing]: undefined });

    assert.throws(
      () => createEmailSender(env),
      (error: unknown) =>
        error instanceof EmailConfigError && error.message.includes(missing),
      `expected a boot failure naming ${missing}`,
    );
  }
});

test("treats an empty string as missing", () => {
  assert.throws(
    () => createEmailSender(smtpEnv({ SMTP_HOST: "   " })),
    (error: unknown) => error instanceof EmailConfigError,
  );
});

test("MAIL_REPLY_TO stays optional", () => {
  assert.ok(createEmailSender(smtpEnv({ MAIL_REPLY_TO: undefined })));
});

test("rejects an ambiguous SMTP_SECURE rather than guessing", () => {
  // "1" and "yes" are plausible but would silently pick the wrong TLS mode,
  // which fails as a connection timeout rather than a clear error.
  for (const value of ["1", "yes", "TRUE", ""]) {
    assert.throws(
      () => createEmailSender(smtpEnv({ SMTP_SECURE: value })),
      (error: unknown) => error instanceof EmailConfigError,
      `expected "${value}" to be rejected`,
    );
  }
});

test("rejects a nonsense SMTP_PORT", () => {
  for (const value of ["abc", "0", "70000", "587.5"]) {
    assert.throws(
      () => createEmailSender(smtpEnv({ SMTP_PORT: value })),
      (error: unknown) => error instanceof EmailConfigError,
      `expected port "${value}" to be rejected`,
    );
  }
});

test("throws on an unknown driver instead of falling back", () => {
  // A typo must stop the boot: a silent fallback to console in production
  // would mean codes going to a log instead of an inbox.
  assert.throws(
    () => createEmailSender({ EMAIL_DRIVER: "sendgrid" }),
    (error: unknown) =>
      error instanceof EmailConfigError && /Unknown EMAIL_DRIVER/.test(error.message),
  );
});
