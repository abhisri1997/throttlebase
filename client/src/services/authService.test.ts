import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "../core/auth/session";
import type { ApiClient, ApiRequest } from "../ports/ApiClient";
import type { SecureStorage } from "../ports/SecureStorage";
import { createAuthService, type ProviderSignIn } from "./authService";

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
    () => Promise.reject(new Error("401")),
    storedSession({ accessTokenExpiresAt: NOW - 1 }),
  );

  const session = await service.getValidSession();

  assert.equal(session, null);
  assert.equal(storage.items.size, 0);
  assert.equal(service.getState().status, "signed-out");
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
