import test from "node:test";
import assert from "node:assert/strict";
import {
  snapToNearestPlace,
  type MeetingPoint,
  type MeetingPointStore,
} from "./meetingPoint.service.js";
import type { SnapDeps } from "./meetingPoint.service.js";

const CENTROID = { lat: 12.9716, lng: 77.5946 };

const makeStore = (
  overrides: Partial<MeetingPointStore> = {},
): MeetingPointStore => {
  const cache = new Map<string, MeetingPoint>();
  return {
    async read(key) {
      return cache.get(key) ?? null;
    },
    async write(key, value) {
      cache.set(key, value);
    },
    async reserve() {
      return true;
    },
    ...overrides,
  };
};

const nearbyResponse = (name: string): Response =>
  new Response(
    JSON.stringify({
      places: [
        {
          id: "place-1",
          displayName: { text: name },
          formattedAddress: `${name} Road`,
          location: { latitude: 12.98, longitude: 77.6 },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const countingFetch = (responses: Response[]) => {
  const state = { calls: 0 };
  const fetchImpl = (async () => {
    const response = responses[state.calls] ?? nearbyResponse("Fallback");
    state.calls++;
    return response;
  }) as unknown as SnapDeps["fetchImpl"];
  return { fetchImpl, state };
};

test("finds all meetup place types in a single Places call", async () => {
  const { fetchImpl, state } = countingFetch([nearbyResponse("Shell")]);

  const result = await snapToNearestPlace(CENTROID, "test-key", {
    fetchImpl,
    store: makeStore(),
  });

  // The legacy implementation issued one call per type; the new API takes them
  // all at once, so a single call must cover the whole list.
  assert.equal(state.calls, 1);
  assert.equal(result.name, "Shell");
});

test("does not call Google once the daily budget is spent", async () => {
  const { fetchImpl, state } = countingFetch([nearbyResponse("Never")]);

  const result = await snapToNearestPlace(CENTROID, "test-key", {
    fetchImpl,
    store: makeStore({ async reserve() { return false; } }),
  });

  assert.equal(state.calls, 0, "budget spent; no Google call may be made");
  assert.equal(result.name, "Calculated Meeting Point");
  assert.equal(result.lat, CENTROID.lat);
});

test("a repeat snap at the same point is served from cache", async () => {
  const { fetchImpl, state } = countingFetch([nearbyResponse("Shell")]);
  const deps = { fetchImpl, store: makeStore() };

  await snapToNearestPlace(CENTROID, "test-key", deps);
  await snapToNearestPlace(CENTROID, "test-key", deps);

  assert.equal(state.calls, 1, "second snap must not re-bill");
});

test("a metres-scale move reuses the cached meeting point", async () => {
  const { fetchImpl, state } = countingFetch([nearbyResponse("Shell")]);
  const deps = { fetchImpl, store: makeStore() };

  await snapToNearestPlace(CENTROID, "test-key", deps);
  // ~10m away: the geometric median shifts like this on every participant change.
  await snapToNearestPlace(
    { lat: CENTROID.lat + 0.00009, lng: CENTROID.lng },
    "test-key",
    deps,
  );

  assert.equal(state.calls, 1);
});

test("degrades to the raw centroid when Google refuses", async () => {
  const { fetchImpl } = countingFetch([
    new Response("permission denied", { status: 403 }),
  ]);

  const result = await snapToNearestPlace(CENTROID, "test-key", {
    fetchImpl,
    store: makeStore(),
  });

  assert.equal(result.name, "Calculated Meeting Point");
  assert.equal(result.lat, CENTROID.lat);
});
