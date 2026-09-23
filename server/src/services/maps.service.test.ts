import test from "node:test";
import assert from "node:assert/strict";
import {
  autocompletePlaces,
  getDirections,
  getPlaceDetails,
  reverseGeocode,
  USAGE_API_DIRECTIONS,
  USAGE_API_GEOCODING,
  USAGE_API_PLACES_AUTOCOMPLETE,
  USAGE_API_PLACES_DETAILS,
  type MapsCacheStore,
} from "./maps.service.js";
import {
  MapsApiError,
  type DirectionsResult,
  type MapsProvider,
} from "./maps/mapsProvider.js";

const SESSION_TOKEN = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

const DIRECTIONS: DirectionsResult = {
  routes: [
    {
      overviewPolyline: "overview",
      legs: [
        {
          startLocation: { lat: 1, lng: 2 },
          endLocation: { lat: 3, lng: 4 },
          distanceMeters: 1000,
          durationSeconds: 600,
          steps: [],
        },
      ],
    },
  ],
};

/** Counts what each provider method was asked for, without touching Google. */
const makeProvider = (overrides: Partial<MapsProvider> = {}) => {
  const calls = {
    directions: 0,
    reverseGeocode: 0,
    autocomplete: 0,
    details: 0,
  };

  const provider: MapsProvider = {
    async getDirections() {
      calls.directions++;
      return DIRECTIONS;
    },
    async reverseGeocode() {
      calls.reverseGeocode++;
      return "MG Road, Bengaluru";
    },
    async autocompletePlaces() {
      calls.autocomplete++;
      return [{ placeId: "p1", primaryText: "Indiranagar", secondaryText: "Bengaluru" }];
    },
    async getPlaceDetails() {
      calls.details++;
      return { placeId: "p1", name: "Cafe", address: "MG Road", lat: 12.9, lng: 77.5 };
    },
    async searchAlongRoute() {
      return [];
    },
    async searchNearby() {
      return [];
    },
    ...overrides,
  };

  return { provider, calls };
};

/** In-memory store standing in for Postgres, recording TTLs and reservations. */
const makeStore = (options: { allowReserve?: boolean } = {}) => {
  const cache = new Map<string, unknown>();
  const writes: { cacheKey: string; category: string; ttlMs: number }[] = [];
  const reservations: string[] = [];

  const store: MapsCacheStore = {
    async read<T>(cacheKey: string) {
      return (cache.get(cacheKey) as T | undefined) ?? null;
    },
    async write(cacheKey, category, value, ttlMs) {
      writes.push({ cacheKey, category, ttlMs });
      cache.set(cacheKey, value);
    },
    async reserve(api: string) {
      reservations.push(api);
      return options.allowReserve ?? true;
    },
  };

  return { store, writes, reservations, cache };
};

/** Silences the budget warning these tests deliberately trigger. */
const withSilencedWarnings = async (run: () => Promise<void>): Promise<void> => {
  const original = console.warn;
  console.warn = () => {};
  try {
    await run();
  } finally {
    console.warn = original;
  }
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

test("serves an identical directions request from cache without calling Google", async () => {
  const { provider, calls } = makeProvider();
  const { store, reservations } = makeStore();
  const request = { origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } };

  const first = await getDirections(request, { provider, store });
  const second = await getDirections(request, { provider, store });

  assert.equal(calls.directions, 1, "the second request should not reach Google");
  assert.deepEqual(second, first);
  assert.deepEqual(reservations, [USAGE_API_DIRECTIONS], "a cache hit must not spend budget");
});

test("treats a different waypoint set as a different route", async () => {
  const { provider, calls } = makeProvider();
  const { store } = makeStore();
  const base = { origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } };

  await getDirections(base, { provider, store });
  await getDirections({ ...base, waypoints: [{ lat: 9, lng: 9 }] }, { provider, store });

  assert.equal(calls.directions, 2);
});

test("caches a traffic-aware route for a minute, not the plain five", async () => {
  const { provider } = makeProvider();
  const { store, writes } = makeStore();
  const request = { origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } };

  await getDirections(request, { provider, store });
  await getDirections({ ...request, trafficAware: true }, { provider, store });

  assert.equal(writes[0]!.ttlMs, FIVE_MINUTES_MS);
  assert.equal(
    writes[1]!.ttlMs,
    ONE_MINUTE_MS,
    "a five-minute entry would serve the traffic refresh its own stale answer",
  );
});

test("rounds reverse-geocode coordinates so nearby pins share one cache entry", async () => {
  const { provider, calls } = makeProvider();
  const { store, writes } = makeStore();

  const first = await reverseGeocode({ lat: 12.97161234, lng: 77.59461234 }, { provider, store });
  const second = await reverseGeocode({ lat: 12.97161987, lng: 77.59461987 }, { provider, store });

  assert.equal(calls.reverseGeocode, 1, "a ~1 cm difference should not re-bill");
  assert.deepEqual(second, first);
  assert.equal(writes[0]!.ttlMs, ONE_DAY_MS);
});

test("caches a missing address so an unmapped point is not looked up repeatedly", async () => {
  let lookups = 0;
  const { provider } = makeProvider({
    async reverseGeocode() {
      lookups++;
      return null;
    },
  });
  const { store } = makeStore();

  const first = await reverseGeocode({ lat: 0, lng: 0 }, { provider, store });
  const second = await reverseGeocode({ lat: 0, lng: 0 }, { provider, store });

  assert.deepEqual(first, { formattedAddress: null });
  assert.deepEqual(second, { formattedAddress: null });
  assert.equal(lookups, 1, "a known-empty answer must not be re-billed");
});

test("keys place details on the place alone, so a new session reuses the entry", async () => {
  const { provider, calls } = makeProvider();
  const { store } = makeStore();

  await getPlaceDetails("p1", SESSION_TOKEN, { provider, store });
  await getPlaceDetails("p1", "8f14e45f-ceea-467a-9f2b-6d1c4a3e5b7c", { provider, store });

  assert.equal(calls.details, 1);
});

test("does not cache autocomplete, because Google bills the session not the request", async () => {
  const { provider, calls } = makeProvider();
  const { store, writes, reservations } = makeStore();
  const request = { input: "indira", sessionToken: SESSION_TOKEN };

  await autocompletePlaces(request, { provider, store });
  await autocompletePlaces(request, { provider, store });

  assert.equal(calls.autocomplete, 2);
  assert.equal(writes.length, 0);
  assert.deepEqual(reservations, [
    USAGE_API_PLACES_AUTOCOMPLETE,
    USAGE_API_PLACES_AUTOCOMPLETE,
  ]);
});

/* -------------------------------------------------------------------------- */
/* Daily budget                                                                */
/* -------------------------------------------------------------------------- */

test("stops before Google once the daily directions budget is spent", async () => {
  const { provider, calls } = makeProvider();
  const { store } = makeStore({ allowReserve: false });

  await withSilencedWarnings(async () => {
    await assert.rejects(
      () =>
        getDirections(
          { origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } },
          { provider, store },
        ),
      (error: unknown) => error instanceof MapsApiError && error.kind === "quota",
    );
  });

  assert.equal(calls.directions, 0, "no call may be made once the budget is spent");
});

test("stops before Google once the autocomplete budget is spent", async () => {
  const { provider, calls } = makeProvider();
  const { store } = makeStore({ allowReserve: false });

  await withSilencedWarnings(async () => {
    await assert.rejects(
      () => autocompletePlaces({ input: "x", sessionToken: SESSION_TOKEN }, { provider, store }),
      (error: unknown) => error instanceof MapsApiError && error.kind === "quota",
    );
  });

  assert.equal(calls.autocomplete, 0);
});

test("counts each API against its own daily budget", async () => {
  const { provider } = makeProvider();
  const { store, reservations } = makeStore();

  await getDirections({ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } }, { provider, store });
  await reverseGeocode({ lat: 1, lng: 2 }, { provider, store });
  await autocompletePlaces({ input: "x", sessionToken: SESSION_TOKEN }, { provider, store });
  await getPlaceDetails("p1", SESSION_TOKEN, { provider, store });

  assert.deepEqual(reservations, [
    USAGE_API_DIRECTIONS,
    USAGE_API_GEOCODING,
    USAGE_API_PLACES_AUTOCOMPLETE,
    USAGE_API_PLACES_DETAILS,
  ]);
});
