import test from "node:test";
import assert from "node:assert/strict";
import {
  decideSessionAction,
  REFRESH_SKEW_MS,
  sessionFromResponse,
  type Session,
} from "./session";

const NOW = Date.parse("2026-01-01T12:00:00.000Z");

const session = (overrides: Partial<Session> = {}): Session => ({
  riderId: "rider-1",
  accessToken: "access",
  accessTokenExpiresAt: NOW + 15 * 60_000,
  refreshToken: "refresh",
  refreshTokenExpiresAt: NOW + 30 * 24 * 60 * 60_000,
  needsOnboarding: false,
  ...overrides,
});

test("uses a session whose access token has plenty of life left", () => {
  assert.equal(decideSessionAction(session(), NOW), "use");
});

test("refreshes once the access token enters the skew window", () => {
  // Arrange: expires in exactly the skew period
  const s = session({ accessTokenExpiresAt: NOW + REFRESH_SKEW_MS });

  // Assert: refreshed early rather than used and failing mid-request
  assert.equal(decideSessionAction(s, NOW), "refresh");
});

test("refreshes an already-expired access token", () => {
  assert.equal(
    decideSessionAction(session({ accessTokenExpiresAt: NOW - 1 }), NOW),
    "refresh",
  );
});

test("signs out when the refresh token has expired", () => {
  // Arrange: both tokens dead — a refresh attempt would certainly 401
  const s = session({
    accessTokenExpiresAt: NOW - 1,
    refreshTokenExpiresAt: NOW - 1,
  });

  assert.equal(decideSessionAction(s, NOW), "sign-out");
});

test("signs out when there is no session at all", () => {
  assert.equal(decideSessionAction(null, NOW), "sign-out");
});

test("prefers signing out over refreshing when both tokens are dead", () => {
  const s = session({
    accessTokenExpiresAt: NOW - 10_000,
    refreshTokenExpiresAt: NOW - 10_000,
  });
  assert.notEqual(decideSessionAction(s, NOW), "refresh");
});

test("parses the API's ISO timestamps into epoch milliseconds", () => {
  const result = sessionFromResponse({
    riderId: "rider-9",
    accessToken: "a",
    accessTokenExpiresAt: "2026-01-01T12:15:00.000Z",
    refreshToken: "r",
    refreshTokenExpiresAt: "2026-01-31T12:00:00.000Z",
    needsOnboarding: true,
  });

  assert.equal(result.accessTokenExpiresAt, Date.parse("2026-01-01T12:15:00.000Z"));
  assert.equal(result.refreshTokenExpiresAt, Date.parse("2026-01-31T12:00:00.000Z"));
  assert.equal(result.needsOnboarding, true);
});

test("a refresh response carries the previous onboarding state forward", () => {
  // Arrange: /auth/refresh says nothing about onboarding
  const previous = session({ needsOnboarding: true });

  const result = sessionFromResponse(
    {
      riderId: "rider-1",
      accessToken: "a2",
      accessTokenExpiresAt: "2026-01-01T12:15:00.000Z",
      refreshToken: "r2",
      refreshTokenExpiresAt: "2026-01-31T12:00:00.000Z",
    },
    previous,
  );

  // Assert: a rider mid-onboarding is not silently marked complete
  assert.equal(result.needsOnboarding, true);
});

test("defaults onboarding to false when nothing is known", () => {
  const result = sessionFromResponse({
    riderId: "rider-1",
    accessToken: "a",
    accessTokenExpiresAt: "2026-01-01T12:15:00.000Z",
    refreshToken: "r",
    refreshTokenExpiresAt: "2026-01-31T12:00:00.000Z",
  });

  assert.equal(result.needsOnboarding, false);
});
