import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "../core/auth/session";
import { ApiError, type ApiClient, type ApiRequest } from "../ports/ApiClient";
import type { SecureStorage } from "../ports/SecureStorage";
import { createAuthService, type ProviderSignIn } from "./authService";
import { TERMS } from "../core/legal/terms";

const NOW = Date.parse("2026-01-01T12:00:00.000Z");

class MemoryStorage implements SecureStorage {
  readonly items = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.items.get(key) ?? null);
  }
  set(key: string, value: string): Promise<void> {
    this.items.set(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.items.delete(key);
    return Promise.resolve();
  }
}

const storedSession = (overrides: Partial<Session> = {}): Session => ({
  riderId: "rider-1",
  accessToken: "access-1",
  accessTokenExpiresAt: NOW + 15 * 60_000,
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: NOW + 30 * 24 * 60 * 60_000,
  needsOnboarding: false,
  ...overrides,
});

const refreshResponse = (n: number) => ({
  riderId: "rider-1",
  accessToken: `access-${n}`,
  accessTokenExpiresAt: new Date(NOW + 15 * 60_000).toISOString(),
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: new Date(NOW + 30 * 24 * 60 * 60_000).toISOString(),
});

const noProviders: ProviderSignIn = {
  google: () => Promise.reject(new Error("not used")),
  apple: () => Promise.reject(new Error("not used")),
  googleSignOut: () => Promise.resolve(),
};

const buildService = (
  handler: (request: ApiRequest) => Promise<unknown>,
  session: Session | null,
) => {
  const storage = new MemoryStorage();
  if (session) {
    storage.items.set("throttlebase.session.v1", JSON.stringify(session));
  }

  const calls: ApiRequest[] = [];
  const apiClient: ApiClient = {
    request: async <T>(request: ApiRequest): Promise<T> => {
      calls.push(request);
      return (await handler(request)) as T;
    },
  };

  const service = createAuthService({
    storage,
    apiClient,
    providers: noProviders,
    now: () => NOW,
  });

  return { service, storage, calls };
};

test("a healthy session is used without contacting the server", async () => {
  const { service, calls } = buildService(
    () => Promise.reject(new Error("should not be called")),
    storedSession(),
  );

  const session = await service.getValidSession();

  assert.equal(session?.accessToken, "access-1");
  assert.equal(calls.length, 0);
});

test("relaunching with a still-valid stored session signs the rider in", async () => {
  // Arrange: the app was killed minutes after signing in, so the stored
  // access token is still good and no refresh is needed.
  const { service, calls } = buildService(
    () => Promise.reject(new Error("should not be called")),
    storedSession(),
  );

  // Act: what the root layout does on launch.
  await service.getValidSession();

  // Assert
  const state = service.getState();
  assert.equal(state.status, "signed-in");
  assert.equal(state.status === "signed-in" ? state.session.riderId : null, "rider-1");
  assert.equal(calls.length, 0);
});

test("repeated checks of a valid session announce the sign-in only once", async () => {
  const { service } = buildService(
    () => Promise.reject(new Error("should not be called")),
    storedSession(),
  );
  const seen: string[] = [];
  service.onChange((next) => seen.push(next.status));

  await service.getValidSession();
  await service.getValidSession();
  await service.getValidSession();

  // The initial "loading" delivered on subscribe, then one "signed-in".
  assert.deepEqual(seen, ["loading", "signed-in"]);
});

test("an expiring access token is refreshed", async () => {
  // Arrange: inside the 60s skew window
  const { service, calls } = buildService(
    () => Promise.resolve(refreshResponse(2)),
    storedSession({ accessTokenExpiresAt: NOW + 30_000 }),
  );

  const session = await service.getValidSession();

  assert.equal(session?.accessToken, "access-2");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/auth/refresh");
});

test("concurrent callers trigger exactly ONE refresh", async () => {
  // Arrange: this is the whole reason single-flight exists — the backend
  // revokes the family if an already-rotated token is presented twice.
  let refreshes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const { service } = buildService(async () => {
    refreshes += 1;
    await gate;
    return refreshResponse(2);
  }, storedSession({ accessTokenExpiresAt: NOW - 1 }));

  // Act: a screen and a background location task wake together
  const all = Promise.all([
    service.getValidSession(),
    service.getValidSession(),
    service.getValidSession(),
  ]);
  release();
  const results = await all;

  // Assert
  assert.equal(refreshes, 1, "a second refresh would revoke the family");
  for (const result of results) {
    assert.equal(result?.accessToken, "access-2");
  }
});

test("a rejected refresh signs the rider out and clears storage", async () => {
  const { service, storage } = buildService(
    () => Promise.reject(new ApiError(401, "Session has been revoked.", "REFRESH_TOKEN_INVALID")),
    storedSession({ accessTokenExpiresAt: NOW - 1 }),
  );

  const session = await service.getValidSession();

  assert.equal(session, null);
  assert.equal(storage.items.size, 0);
  assert.equal(service.getState().status, "signed-out");
});

test("a refresh the server cannot read signs the rider out", async () => {
  const { service, storage } = buildService(
    () => Promise.reject(new ApiError(400, "Validation failed")),
    storedSession({ accessTokenExpiresAt: NOW - 1 }),
  );

  assert.equal(await service.getValidSession(), null);
  assert.equal(storage.items.size, 0);
  assert.equal(service.getState().status, "signed-out");
});

for (const [label, failure] of [
  ["no signal", () => new TypeError("Network request failed")],
  ["a timeout", () => new DOMException("The operation was aborted.", "AbortError")],
  ["a server error", () => new ApiError(500, "Internal server error")],
  ["a bad gateway mid-deploy", () => new ApiError(502, "Request failed (502)")],
  ["rate limiting", () => new ApiError(429, "Too many requests", "RATE_LIMITED")],
] as const) {
  test(`a refresh that fails with ${label} keeps the rider signed in`, async () => {
    // Arrange: the access token has expired and the refresh gets no answer
    // about the refresh token itself.
    const stored = storedSession({ accessTokenExpiresAt: NOW - 1 });
    const { service, storage } = buildService(() => Promise.reject(failure()), stored);

    // Act
    const session = await service.getValidSession();

    // Assert: same session, still stored, still signed in.
    assert.equal(session?.refreshToken, "refresh-1");
    assert.equal(session?.accessToken, "access-1");
    assert.equal(
      JSON.parse(storage.items.get("throttlebase.session.v1") as string).refreshToken,
      "refresh-1",
    );
    assert.equal(service.getState().status, "signed-in");
  });
}

test("launching with no signal and an expired access token opens the app", async () => {
  // Arrange: the app was closed for an hour and is opened out of coverage.
  const { service } = buildService(
    () => Promise.reject(new TypeError("Network request failed")),
    storedSession({ accessTokenExpiresAt: NOW - 60 * 60_000 }),
  );
  assert.equal(service.getState().status, "loading");

  // Act: what the root layout does on launch.
  await service.getValidSession();

  // Assert: signed in, not stuck on the splash or sent to sign-in.
  assert.equal(service.getState().status, "signed-in");
});

test("the refresh is tried again once the signal comes back", async () => {
  // Arrange: the first refresh gets no answer, the second succeeds.
  let online = false;
  const { service, calls } = buildService(async () => {
    if (!online) throw new TypeError("Network request failed");
    return refreshResponse(2);
  }, storedSession({ accessTokenExpiresAt: NOW - 1 }));

  await service.getValidSession();

  // Act
  online = true;
  const session = await service.getValidSession();

  // Assert
  assert.equal(session?.accessToken, "access-2");
  assert.equal(calls.filter((call) => call.path === "/auth/refresh").length, 2);
});

test("a 401 retry whose refresh gets no answer fails the request, not the session", async () => {
  // Arrange: the HTTP adapter calls refreshAccessToken after a 401.
  const storage = new MemoryStorage();
  storage.items.set("throttlebase.session.v1", JSON.stringify(storedSession()));
  let options!: { refreshAccessToken: () => Promise<string | null> };
  const service = createAuthService({
    storage,
    providers: noProviders,
    now: () => NOW,
    createApi: (given) => {
      options = given;
      return {
        request: () => Promise.reject(new TypeError("Network request failed")),
      };
    },
  });
  await service.getValidSession();

  // Act + Assert
  await assert.rejects(options.refreshAccessToken(), TypeError);
  assert.equal(service.getState().status, "signed-in");
  assert.equal(storage.items.size, 1);
});

test("an expired refresh token signs out without a doomed request", async () => {
  // Arrange: both tokens dead
  const { service, calls } = buildService(
    () => Promise.reject(new Error("should not be called")),
    storedSession({
      accessTokenExpiresAt: NOW - 1,
      refreshTokenExpiresAt: NOW - 1,
    }),
  );

  const session = await service.getValidSession();

  assert.equal(session, null);
  assert.equal(calls.length, 0, "no point calling an endpoint that must 401");
});

test("no stored session means signed out", async () => {
  const { service } = buildService(
    () => Promise.reject(new Error("should not be called")),
    null,
  );

  assert.equal(await service.getValidSession(), null);
  assert.equal(service.getState().status, "signed-out");
});

test("the refresh token is persisted only under the secure key", async () => {
  const { service, storage } = buildService(
    () => Promise.resolve(refreshResponse(2)),
    storedSession({ accessTokenExpiresAt: NOW - 1 }),
  );

  await service.getValidSession();

  assert.deepEqual([...storage.items.keys()], ["throttlebase.session.v1"]);
  const stored = JSON.parse(storage.items.get("throttlebase.session.v1") as string);
  assert.equal(stored.refreshToken, "refresh-2");
});

test("completing onboarding clears the flag locally", async () => {
  const { service } = buildService(
    () => Promise.resolve({}),
    storedSession({ needsOnboarding: true }),
  );

  await service.completeOnboarding({
    username: "ada",
    displayName: "Ada",
    experienceLevel: "beginner",
    locationCity: null,
    firstVehicle: null,
  });

  const state = service.getState();
  assert.equal(state.status, "signed-in");
  assert.equal(state.status === "signed-in" && state.session.needsOnboarding, false);
});

test("onChange delivers the current state immediately and on every change", async () => {
  const { service } = buildService(
    () => Promise.resolve({}),
    storedSession(),
  );

  const seen: string[] = [];
  const unsubscribe = service.onChange((state) => seen.push(state.status));

  await service.getValidSession();
  await service.signOut();

  assert.equal(seen[0], "loading", "subscribers get the state on subscribe");
  assert.equal(seen.at(-1), "signed-out");

  unsubscribe();
  await service.getValidSession();
  assert.equal(seen.at(-1), "signed-out", "no events after unsubscribe");
});

test("signing out still clears local state when the server call fails", async () => {
  // Arrange: offline
  const { service, storage } = buildService(
    () => Promise.reject(new Error("network down")),
    storedSession(),
  );

  await service.signOut();

  assert.equal(storage.items.size, 0);
  assert.equal(service.getState().status, "signed-out");
});

test("signing up accepts the version of the Terms the app shows", async () => {
  // Arrange
  const { service, calls } = buildService(() => Promise.resolve(refreshResponse(1)), null);

  // Act
  await service.verifyEmailCode("asha@example.test", "123456");

  // Assert
  const body = calls[0]?.body as { acceptedTermsVersion?: string };
  assert.equal(body.acceptedTermsVersion, TERMS.version);
});

test("asking to delete emails a code and keeps the rider signed in", async () => {
  // Arrange
  const { service, calls, storage } = buildService(
    () => Promise.resolve({ expiresInSeconds: 600 }),
    storedSession(),
  );

  // Act
  await service.requestDeletionCode();

  // Assert
  assert.equal(calls[0]?.path, "/api/riders/me/deletion-code");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(storage.items.size > 0, true);
});

test("deleting sends the emailed code, then signs the rider out", async () => {
  // Arrange
  const { service, calls, storage } = buildService(
    () => Promise.resolve(undefined),
    storedSession(),
  );
  await service.getValidSession();

  // Act
  await service.deleteAccount("123456");

  // Assert
  assert.equal(calls[0]?.path, "/api/riders/me");
  assert.equal(calls[0]?.method, "DELETE");
  assert.deepEqual(calls[0]?.body, { code: "123456" });
  assert.equal(storage.items.size, 0);
  assert.equal(service.getState().status, "signed-out");
});

test("a refused deletion code keeps the rider signed in", async () => {
  // Arrange
  const { service, storage } = buildService(
    () => Promise.reject(new ApiError(401, "That code is not valid.")),
    storedSession(),
  );
  await service.getValidSession();

  // Act + Assert
  await assert.rejects(() => service.deleteAccount("000000"), ApiError);
  assert.equal(service.getState().status, "signed-in");
  assert.equal(storage.items.size > 0, true);
});

test("a deleted account is signed out here even if the Google sign-out fails", async () => {
  // Arrange: the server deletes, then the Google SDK throws
  const storage = new MemoryStorage();
  storage.items.set("throttlebase.session.v1", JSON.stringify(storedSession()));
  const service = createAuthService({
    storage,
    apiClient: { request: <T>() => Promise.resolve(undefined as T) },
    providers: { ...noProviders, googleSignOut: () => Promise.reject(new Error("sdk")) },
    now: () => NOW,
  });
  await service.getValidSession();

  // Act
  await service.deleteAccount("123456");

  // Assert
  assert.equal(storage.items.size, 0);
  assert.equal(service.getState().status, "signed-out");
});
