import { AuthError } from "./errors.js";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/**
 * Handles we keep for ourselves, so nobody can impersonate the product or a
 * system endpoint. Compared case-insensitively against the normalized form.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "billing",
  "contact",
  "dev",
  "help",
  "info",
  "legal",
  "login",
  "mail",
  "me",
  "moderator",
  "null",
  "owner",
  "privacy",
  "root",
  "security",
  "settings",
  "signup",
  "staff",
  "support",
  "system",
  "team",
  "terms",
  "test",
  "throttlebase",
  "undefined",
  "user",
  "webmaster",
]);

/** Lowercases and trims. Does not validate. */
export const normalizeUsername = (raw: string): string =>
  raw.trim().toLowerCase();

export interface UsernameCheck {
  available: boolean;
  reason: "ok" | "invalid_format" | "reserved" | "taken";
}

export const isUsernameWellFormed = (candidate: string): boolean =>
  USERNAME_PATTERN.test(candidate);

export const isUsernameReserved = (candidate: string): boolean =>
  RESERVED_USERNAMES.has(candidate);

/**
 * Format and reserved-list checks only — the caller supplies the uniqueness
 * answer, since that needs the database.
 */
export const checkUsername = (
  raw: string,
  isTaken: boolean,
): UsernameCheck => {
  const candidate = normalizeUsername(raw);

  if (!isUsernameWellFormed(candidate)) {
    return { available: false, reason: "invalid_format" };
  }

  if (isUsernameReserved(candidate)) {
    return { available: false, reason: "reserved" };
  }

  if (isTaken) {
    return { available: false, reason: "taken" };
  }

  return { available: true, reason: "ok" };
};

export const assertUsernameAcceptable = (raw: string): string => {
  const candidate = normalizeUsername(raw);

  if (!isUsernameWellFormed(candidate)) {
    throw new AuthError(
      "USERNAME_INVALID",
      "Usernames must be 3-20 characters using lowercase letters, numbers or underscores.",
    );
  }

  if (isUsernameReserved(candidate)) {
    throw new AuthError("USERNAME_INVALID", "That username is reserved.");
  }

  return candidate;
};
