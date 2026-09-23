import crypto from "node:crypto";
import {
  readPlaceCache,
  reserveGoogleCall,
  resolveMaxDailyCalls,
  writePlaceCache,
} from "./placeCache.js";
import { createGoogleMapsProvider } from "./maps/googleMapsProvider.js";
import {
  MapsApiError,
  type FetchLike,
  type MapsProvider,
} from "./maps/mapsProvider.js";

export interface MeetingPoint {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

/** Meetup-friendly place types, all sent in a single Nearby Search call. */
const MEETUP_PLACE_TYPES = [
  "gas_station",
  "cafe",
  "restaurant",
  "parking",
];

const SEARCH_RADIUS_METERS = 2000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USAGE_API = "places_search_nearby";

/**
 * ~110 m grid. Recomputing the geometric median after a participant change
 * usually shifts it by metres, so this makes those recomputations free.
 */
const CACHE_COORD_PRECISION = 3;

/**
 * Postgres touchpoints, injectable so the budget guard can be verified without
 * a database. This is the path that previously spent 1-4 uncached Places calls
 * per participant change, so "no call once the cap is reached" is worth a test.
 */
export interface MeetingPointStore {
  read(
    cacheKey: string,
    options: { allowStale: boolean },
  ): Promise<MeetingPoint | null>;
  write(cacheKey: string, value: MeetingPoint, ttlMs: number): Promise<void>;
  reserve(limit: number): Promise<boolean>;
}

export const postgresMeetingPointStore: MeetingPointStore = {
  read: (cacheKey, options) => readPlaceCache<MeetingPoint>(cacheKey, options),
  write: (cacheKey, value, ttlMs) =>
    writePlaceCache(cacheKey, "meeting_point", value, ttlMs),
  reserve: (limit) => reserveGoogleCall(USAGE_API, limit),
};

export interface SnapDeps {
  fetchImpl?: FetchLike | undefined;
  maxDailyCalls?: number | undefined;
  store?: MeetingPointStore | undefined;
  /** Overrides the Google adapter; tests pass a fake rather than a fake fetch. */
  provider?: MapsProvider | undefined;
}

const buildCacheKey = (lat: number, lng: number): string =>
  crypto
    .createHash("sha256")
    .update(
      `meeting-point|${lat.toFixed(CACHE_COORD_PRECISION)},${lng.toFixed(CACHE_COORD_PRECISION)}`,
    )
    .digest("hex");

const coordinateFallback = (lat: number, lng: number): MeetingPoint => ({
  lat,
  lng,
  name: "Calculated Meeting Point",
  address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
});

/**
 * Snaps a raw centroid to the nearest meetup-friendly place.
 *
 * Replaces the previous legacy-Places implementation, which issued one call per
 * place type with no cache and no budget check, and whose per-type catch made a
 * quota failure indistinguishable from "nothing nearby". Legacy Places also
 * cannot be enabled on Cloud projects created after March 2025.
 *
 * Never throws: every failure degrades to the raw centroid with a readable
 * coordinate address, and logs why.
 */
export const snapToNearestPlace = async (
  centroid: { lat: number; lng: number },
  apiKey: string,
  deps: SnapDeps = {},
): Promise<MeetingPoint> => {
  const { lat, lng } = centroid;
  const store = deps.store ?? postgresMeetingPointStore;
  const provider =
    deps.provider ?? createGoogleMapsProvider({ apiKey, fetchImpl: deps.fetchImpl });
  const cacheKey = buildCacheKey(lat, lng);

  const cached = await store.read(cacheKey, { allowStale: false });
  if (cached) return cached;

  const dailyCallLimit = resolveMaxDailyCalls(deps.maxDailyCalls);

  if (!(await store.reserve(dailyCallLimit))) {
    console.warn(
      "Meeting-point snap skipped: daily Google call budget reached.",
    );
    const stale = await store.read(cacheKey, { allowStale: true });
    return stale ?? coordinateFallback(lat, lng);
  }

  try {
    const places = await provider.searchNearby({
      lat,
      lng,
      radiusMeters: SEARCH_RADIUS_METERS,
      includedTypes: MEETUP_PLACE_TYPES,
      maxResultCount: 1,
    });

    const nearest = places[0];
    const result: MeetingPoint = nearest
      ? {
          lat: nearest.lat,
          lng: nearest.lng,
          name: nearest.name,
          address: nearest.address,
        }
      : coordinateFallback(lat, lng);

    await store.write(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (error) {
    // Surface the reason rather than letting a quota refusal look like an
    // empty neighbourhood, which is what the previous implementation did.
    if (error instanceof MapsApiError) {
      console.error(
        `Meeting-point snap failed${error.isQuotaFailure ? " (quota/permission)" : ""}: ${error.message}`,
      );
    } else {
      console.error("Meeting-point snap failed:", error);
    }
    return coordinateFallback(lat, lng);
  }
};
