import crypto from "node:crypto";
import { readPlaceCache, reserveGoogleCall, writePlaceCache } from "./placeCache.js";
import {
  MapsApiError,
  type AutocompleteRequest,
  type DirectionsRequest,
  type DirectionsResult,
  type LatLngLiteral,
  type MapsProvider,
  type PlaceDetails,
  type PlacePrediction,
} from "./maps/mapsProvider.js";

/**
 * Cache and daily-budget orchestration for the /api/maps proxy.
 *
 * Every method here follows the same order: read cache, reserve one call
 * against today's per-API budget, then call Google. The reservation is atomic
 * and conditional, so the cap cannot be overrun by concurrent requests and a
 * runaway client cannot produce a runaway bill.
 *
 * The budget is deliberately below Google's own per-day quota, so riders hit
 * our 429 rather than an upstream OVER_QUERY_LIMIT we would have to translate.
 */

const DEFAULT_MAX_DAILY_MAPS_CALLS = 900;

/** Per-API counters: different endpoints bill under different SKUs. */
export const USAGE_API_DIRECTIONS = "directions";
export const USAGE_API_GEOCODING = "geocoding";
export const USAGE_API_PLACES_AUTOCOMPLETE = "places_autocomplete";
export const USAGE_API_PLACES_DETAILS = "places_details";

const DIRECTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * A traffic-aware route must outlive far less than a plain one: the live leg
 * refreshes its ETA every five minutes, so a five-minute entry would serve the
 * refresh its own stale answer and the ETA would never move.
 */
const DIRECTIONS_TRAFFIC_CACHE_TTL_MS = 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PLACE_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** ~11 m grid. Two pins this close resolve to the same address in practice. */
const GEOCODE_COORD_PRECISION = 4;

/** Cache labels; the column is VARCHAR(20). */
const CACHE_CATEGORY_DIRECTIONS = "directions";
const CACHE_CATEGORY_GEOCODE = "geocode";
const CACHE_CATEGORY_PLACE_DETAILS = "place_details";

/**
 * Resolves the daily cap. Guards against a non-numeric env value explicitly:
 * `Number(undefined)` is NaN, and NaN comparisons are always false, which would
 * disable the budget rather than enforce it.
 */
export const resolveMaxDailyMapsCalls = (override?: number | undefined): number => {
  if (override !== undefined) return override;

  const fromEnv = Number(process.env.MAX_DAILY_MAPS_CALLS);
  return Number.isFinite(fromEnv) && fromEnv >= 0
    ? fromEnv
    : DEFAULT_MAX_DAILY_MAPS_CALLS;
};

/** The Postgres touchpoints, injectable so budget behaviour is testable without a database. */
export interface MapsCacheStore {
  read<T>(cacheKey: string): Promise<T | null>;
  write(cacheKey: string, category: string, value: unknown, ttlMs: number): Promise<void>;
  reserve(api: string, limit: number): Promise<boolean>;
}

export const postgresMapsCacheStore: MapsCacheStore = {
  read: <T,>(cacheKey: string) => readPlaceCache<T>(cacheKey, { allowStale: false }),
  write: (cacheKey, category, value, ttlMs) =>
    writePlaceCache(cacheKey, category, value, ttlMs),
  reserve: (api, limit) => reserveGoogleCall(api, limit),
};

export interface MapsServiceDeps {
  provider: MapsProvider;
  maxDailyCalls?: number | undefined;
  store?: MapsCacheStore | undefined;
}

const hashKey = (...parts: (string | number | boolean)[]): string =>
  crypto.createHash("sha256").update(parts.join("|")).digest("hex");

const quotaExhausted = (api: string): MapsApiError => {
  console.warn(`[maps] daily budget reached for ${api}; request not sent to Google.`);
  return new MapsApiError(`Daily ${api} budget reached`, "quota", 429);
};

/**
 * Runs `call` unless today's budget for `api` is spent, caching the result.
 *
 * The cache is read before the budget is touched, so a cache hit never consumes
 * a reservation.
 */
const withCacheAndBudget = async <T>(
  deps: MapsServiceDeps,
  options: {
    api: string;
    cacheKey: string;
    category: string;
    ttlMs: number;
    call: () => Promise<T>;
  },
): Promise<T> => {
  const store = deps.store ?? postgresMapsCacheStore;

  const cached = await store.read<T>(options.cacheKey);
  if (cached !== null) return cached;

  const limit = resolveMaxDailyMapsCalls(deps.maxDailyCalls);
  if (!(await store.reserve(options.api, limit))) {
    throw quotaExhausted(options.api);
  }

  const result = await options.call();
  await store.write(options.cacheKey, options.category, result, options.ttlMs);
  return result;
};

/* -------------------------------------------------------------------------- */

export const getDirections = (
  request: DirectionsRequest,
  deps: MapsServiceDeps,
): Promise<DirectionsResult> => {
  const waypoints = request.waypoints ?? [];
  const cacheKey = hashKey(
    CACHE_CATEGORY_DIRECTIONS,
    `${request.origin.lat},${request.origin.lng}`,
    waypoints.map((point) => `${point.lat},${point.lng}`).join(";"),
    `${request.destination.lat},${request.destination.lng}`,
    Boolean(request.preferFastest),
    Boolean(request.trafficAware),
  );

  return withCacheAndBudget<DirectionsResult>(deps, {
    api: USAGE_API_DIRECTIONS,
    cacheKey,
    category: CACHE_CATEGORY_DIRECTIONS,
    ttlMs: request.trafficAware
      ? DIRECTIONS_TRAFFIC_CACHE_TTL_MS
      : DIRECTIONS_CACHE_TTL_MS,
    call: () => deps.provider.getDirections(request),
  });
};

/**
 * Wrapped in an object rather than returned bare so that "Google knows no
 * address for this point" caches as a real answer instead of reading back as a
 * cache miss and re-billing the call on every retry.
 */
export interface ReverseGeocodeResult {
  formattedAddress: string | null;
}

export const reverseGeocode = (
  coords: LatLngLiteral,
  deps: MapsServiceDeps,
): Promise<ReverseGeocodeResult> => {
  const lat = Number(coords.lat.toFixed(GEOCODE_COORD_PRECISION));
  const lng = Number(coords.lng.toFixed(GEOCODE_COORD_PRECISION));
  const cacheKey = hashKey(CACHE_CATEGORY_GEOCODE, lat, lng);

  return withCacheAndBudget<ReverseGeocodeResult>(deps, {
    api: USAGE_API_GEOCODING,
    cacheKey,
    category: CACHE_CATEGORY_GEOCODE,
    ttlMs: GEOCODE_CACHE_TTL_MS,
    call: async () => ({
      formattedAddress: await deps.provider.reverseGeocode({ lat, lng }),
    }),
  });
};

/**
 * Autocomplete is never cached: predictions are keystroke-scoped, and Google
 * bills a session rather than a request, so caching would break the session
 * pricing the details call completes.
 */
export const autocompletePlaces = async (
  request: AutocompleteRequest,
  deps: MapsServiceDeps,
): Promise<PlacePrediction[]> => {
  const store = deps.store ?? postgresMapsCacheStore;
  const limit = resolveMaxDailyMapsCalls(deps.maxDailyCalls);

  if (!(await store.reserve(USAGE_API_PLACES_AUTOCOMPLETE, limit))) {
    throw quotaExhausted(USAGE_API_PLACES_AUTOCOMPLETE);
  }

  return deps.provider.autocompletePlaces(request);
};

export interface PlaceDetailsResult {
  details: PlaceDetails | null;
}

/**
 * Details are cached by place id alone. The session token is deliberately not
 * part of the key: it exists to bill a lookup session, not to identify a place,
 * and including it would make every cache entry single-use.
 */
export const getPlaceDetails = (
  placeId: string,
  sessionToken: string | undefined,
  deps: MapsServiceDeps,
): Promise<PlaceDetailsResult> =>
  withCacheAndBudget<PlaceDetailsResult>(deps, {
    api: USAGE_API_PLACES_DETAILS,
    cacheKey: hashKey(CACHE_CATEGORY_PLACE_DETAILS, placeId),
    category: CACHE_CATEGORY_PLACE_DETAILS,
    ttlMs: PLACE_DETAILS_CACHE_TTL_MS,
    call: async () => ({
      details: await deps.provider.getPlaceDetails({ placeId, sessionToken }),
    }),
  });
