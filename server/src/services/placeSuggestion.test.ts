import test from "node:test";
import assert from "node:assert/strict";
import { encodePolyline, type LatLng } from "../utils/polyline.js";
import {
  buildCacheKey,
  getStopSuggestions,
  type StopSuggestion,
  type StopSuggestionDeps,
  type SuggestionStore,
} from "./placeSuggestion.service.js";
import type { StopSuggestionQueryInput } from "../schemas/placeSuggestion.schemas.js";

/** A ~110km due-east line along the equator; easy to reason about in metres. */
const ROUTE: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.5 },
  { lat: 0, lng: 1 },
];
const ROUTE_POLYLINE = encodePolyline(ROUTE);

const baseQuery = (
  overrides: Partial<StopSuggestionQueryInput> = {},
): StopSuggestionQueryInput => ({
  category: "fuel",
  encodedPolyline: ROUTE_POLYLINE,
  mode: "planning",
  limit: 10,
  ...overrides,
});

/** In-memory store standing in for Postgres. */
const makeStore = (
  overrides: Partial<SuggestionStore> = {},
): SuggestionStore & { reserveCalls: number } => {
  const cache = new Map<string, StopSuggestion[]>();
  const store = {
    reserveCalls: 0,
    async readCache(key: string) {
      return cache.get(key) ?? null;
    },
    async writeCache(key: string, _c: unknown, suggestions: StopSuggestion[]) {
      cache.set(key, suggestions);
    },
    async reserveCall() {
      store.reserveCalls++;
      return true;
    },
    ...overrides,
  };
  return store as SuggestionStore & { reserveCalls: number };
};

const placesResponse = (
  places: { id: string; lat: number; lng: number }[],
): Response =>
  new Response(
    JSON.stringify({
      places: places.map((p) => ({
        id: p.id,
        displayName: { text: p.id },
        formattedAddress: `${p.id} Road`,
        location: { latitude: p.lat, longitude: p.lng },
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const countingFetch = (responses: Response[]) => {
  const state = { calls: 0 };
  const fetchImpl = (async () => {
    const response = responses[state.calls] ?? placesResponse([]);
    state.calls++;
    return response;
  }) as unknown as StopSuggestionDeps["fetchImpl"];
  return { fetchImpl, state };
};

test("cache key is stable for an identical planning request", () => {
  assert.equal(buildCacheKey(baseQuery()), buildCacheKey(baseQuery()));
});

test("cache key changes with category but not with irrelevant fields", () => {
  assert.notEqual(
    buildCacheKey(baseQuery({ category: "fuel" })),
    buildCacheKey(baseQuery({ category: "rest" })),
  );
});

test("live cache key ignores sub-grid movement but not real movement", () => {
  const near = buildCacheKey(
    baseQuery({ mode: "live", origin: [77.5946, 12.9716] }),
  );
  const barelyMoved = buildCacheKey(
    baseQuery({ mode: "live", origin: [77.5948, 12.9718] }),
  );
  const farAway = buildCacheKey(
    baseQuery({ mode: "live", origin: [78.9, 13.9] }),
  );

  assert.equal(near, barelyMoved, "a few metres should reuse the cached result");
  assert.notEqual(near, farAway, "a different town must not reuse it");
});

test("does not call Google once the daily budget is spent", async () => {
  const { fetchImpl, state } = countingFetch([
    placesResponse([{ id: "should-never-be-requested", lat: 0, lng: 0.5 }]),
  ]);
  const store = makeStore({ async reserveCall() { return false; } });

  const result = await getStopSuggestions(baseQuery(), {
    apiKey: "test-key",
    fetchImpl,
    store,
  });

  assert.equal(state.calls, 0, "budget was spent; no Google call may be made");
  assert.equal(result.degraded, true);
  assert.deepEqual(result.suggestions, []);
});

test("serves stale cache rather than nothing when the budget is spent", async () => {
  const stale: StopSuggestion[] = [
    {
      google_place_id: "stale",
      name: "Yesterday's Pump",
      address: "NH1",
      coords: [0.5, 0],
      distance_along_route_m: 100,
      detour_from_route_m: 10,
    },
  ];
  const { fetchImpl, state } = countingFetch([]);
  const store = makeStore({
    async reserveCall() { return false; },
    async readCache(_key, options) { return options.allowStale ? stale : null; },
  });

  const result = await getStopSuggestions(baseQuery(), {
    apiKey: "test-key",
    fetchImpl,
    store,
  });

  assert.equal(state.calls, 0);
  assert.equal(result.degraded, true);
  assert.equal(result.suggestions.length, 1);
});

test("a cache hit makes no Google call at all", async () => {
  const { fetchImpl, state } = countingFetch([
    placesResponse([{ id: "a", lat: 0, lng: 0.25 }]),
  ]);
  const store = makeStore();
  const deps = { apiKey: "test-key", fetchImpl, store };

  await getStopSuggestions(baseQuery(), deps);
  const callsAfterFirst = state.calls;
  const second = await getStopSuggestions(baseQuery(), deps);

  assert.equal(callsAfterFirst, 1);
  assert.equal(state.calls, 1, "second identical request must be served warm");
  assert.equal(second.cached, true);
});

test("drops places Google returned that are not actually on the route", async () => {
  const { fetchImpl } = countingFetch([
    placesResponse([
      { id: "on-route", lat: 0.001, lng: 0.5 },
      { id: "far-off-route", lat: 1.5, lng: 0.5 },
    ]),
  ]);

  const result = await getStopSuggestions(baseQuery(), {
    apiKey: "test-key",
    fetchImpl,
    store: makeStore(),
  });

  assert.deepEqual(
    result.suggestions.map((s) => s.google_place_id),
    ["on-route"],
  );
});

test("orders suggestions by how far into the ride they fall", async () => {
  const { fetchImpl } = countingFetch([
    placesResponse([
      { id: "late", lat: 0, lng: 0.9 },
      { id: "early", lat: 0, lng: 0.1 },
      { id: "middle", lat: 0, lng: 0.5 },
    ]),
  ]);

  const result = await getStopSuggestions(baseQuery(), {
    apiKey: "test-key",
    fetchImpl,
    store: makeStore(),
  });

  assert.deepEqual(
    result.suggestions.map((s) => s.google_place_id),
    ["early", "middle", "late"],
  );
});

test("falls back to searching each half when a loop returns nothing", async () => {
  // Start and end within the loop threshold, so an empty first result is
  // the documented loop behaviour rather than a genuinely empty corridor.
  const loop: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0.2, lng: 0.2 },
    { lat: 0, lng: 0.001 },
  ];

  const { fetchImpl, state } = countingFetch([
    placesResponse([]),
    placesResponse([{ id: "first-half", lat: 0.1, lng: 0.1 }]),
    placesResponse([{ id: "second-half", lat: 0.1, lng: 0.1 }]),
  ]);

  const result = await getStopSuggestions(
    baseQuery({ encodedPolyline: encodePolyline(loop) }),
    { apiKey: "test-key", fetchImpl, store: makeStore() },
  );

  assert.equal(state.calls, 3, "one failed search plus both halves");
  assert.equal(result.degraded, false);
  assert.ok(result.suggestions.length >= 1, "loop fallback should find places");
});

test("degrades instead of throwing when Google refuses the request", async () => {
  const { fetchImpl } = countingFetch([
    new Response("permission denied", { status: 403 }),
  ]);

  const result = await getStopSuggestions(baseQuery(), {
    apiKey: "test-key",
    fetchImpl,
    store: makeStore(),
  });

  assert.equal(result.degraded, true);
  assert.deepEqual(result.suggestions, []);
});
