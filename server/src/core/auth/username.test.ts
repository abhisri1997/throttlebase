import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "./errors.js";
import {
  assertUsernameAcceptable,
  checkUsername,
  normalizeUsername,
} from "./username.js";

test("accepts lowercase letters, digits and underscores within 3-20 chars", () => {
  for (const candidate of ["ada", "ada_99", "a_b_c", "x".repeat(20)]) {
    assert.deepEqual(checkUsername(candidate, false), {
      available: true,
      reason: "ok",
    });
  }
});

test("rejects usernames outside the length bounds", () => {
  for (const candidate of ["ab", "x".repeat(21)]) {
    assert.equal(checkUsername(candidate, false).reason, "invalid_format");
  }
});

test("rejects characters outside [a-z0-9_]", () => {
  for (const candidate of ["ada rider", "ada-rider", "ada.rider", "adaé"]) {
    assert.equal(checkUsername(candidate, false).reason, "invalid_format");
  }
});

test("normalizes case and surrounding whitespace before validating", () => {
  assert.equal(normalizeUsername("  AdaRider  "), "adarider");
  assert.equal(checkUsername("  AdaRider  ", false).reason, "ok");
});

test("rejects reserved handles regardless of case", () => {
  for (const candidate of ["admin", "Support", "THROTTLEBASE", "api", "root"]) {
    assert.equal(checkUsername(candidate, false).reason, "reserved");
  }
});

test("reports a taken username separately from an invalid one", () => {
  assert.deepEqual(checkUsername("ada", true), {
    available: false,
    reason: "taken",
  });
});

test("assertUsernameAcceptable returns the normalized handle", () => {
  assert.equal(assertUsernameAcceptable("  AdaRider "), "adarider");
});

test("assertUsernameAcceptable throws on invalid and reserved handles", () => {
  for (const candidate of ["ab", "admin"]) {
    assert.throws(
      () => assertUsernameAcceptable(candidate),
      (error: unknown) =>
        error instanceof AuthError && error.code === "USERNAME_INVALID",
    );
  }
});
