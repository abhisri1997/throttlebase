import crypto from "node:crypto";
import {
  readPlaceCache,
  reserveGoogleCall,
  resolveMaxDailyCalls,
  writePlaceCache,
} from "./placeCache.js";
import {
  cumulativeDistances,
  decodePolyline,
  encodePolyline,
  haversineMeters,
  projectOntoPolyline,
  type LatLng,
} from "../utils/polyline.js";
import {
  PlacesApiError,
  searchAlongRoute,
  type FetchLike,
  type PlaceResult,
} from "./placesClient.js";
import type { StopSuggestionQueryInput } from "../schemas/placeSuggestion.schemas.js";

export type StopCategory = "fuel" | "rest" | "photo";

/** Text Search phrase per stop category. */
const CATEGORY_QUERIES: Record<StopCategory, string> = {
  fuel: "petrol pump",
  rest: "restaurant cafe",
  photo: "scenic viewpoint",
};

/**
 * Google explicitly allows search-along-route results to sit on alternate
 * paths, so this filter is required for correctness, not just presentation.
 */
const MAX_DETOUR_METERS = 3000;

/**
 * Origin and destination closer than this make the route a loop, which Google
 * documents as potentially returning nothing. Triggers the split fallback.
 */
const LOOP_THRESHOLD_METERS = 5000;

const CACHE_TTL_PLANNING_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_LIVE_MS = 60 * 60 * 1000;

/** ~1.1 km grid, so a rider moving within a block reuses cached results. */
const LIVE_CACHE_COORD_PRECISION = 2;

const USAGE_API = "places_text_search";

export interface StopSuggestion {
  google_place_id: string;
  name: string;
  address: string;
  coords: [number, number];
  distance_along_route_m: number;
  detour_from_route_m: number;
}

export interface StopSuggestionResult {
  suggestions: StopSuggestion[];
  cached: boolean;
  /** True when the budget or Google itself refused; the UI falls back to manual search. */
  degraded: boolean;
}

/**
 * The service's three Postgres touchpoints, behind one interface.
 *
 * Injectable so the budget guard can be tested without a database: asserting
 * "no Google call happens once the cap is reached" is the one invariant whose
 * regression costs real money silently.
 */
export interface SuggestionStore {
  readCache(
    cacheKey: string,
    options: { allowStale: boolean },
  ): Promise<StopSuggestion[] | null>;
  writeCache(
    cacheKey: string,
    category: StopCategory,
    suggestions: StopSuggestion[],
    ttlMs: number,
  ): Promise<void>;
  reserveCall(limit: number): Promise<boolean>;
}

export interface StopSuggestionDeps {
  apiKey: string;
  fetchImpl?: FetchLike | undefined;
  maxDailyCalls?: number | undefined;
  store?: SuggestionStore | undefined;
}

const quantize = (value: number, precision: number): string =>
  value.toFixed(precision);

/**
 * Planning keys pin the exact route, so any route change invalidates naturally.
 * Live keys pin a coarse position grid instead, because the ahead-polyline
 * changes on every GPS tick and would otherwise never hit cache.
 */
export const buildCacheKey = (input: StopSuggestionQueryInput): string => {
  const parts =
    input.mode === "live"
      ? [
          "live",
          input.category,
          input.origin
            ? `${quantize(input.origin[0], LIVE_CACHE_COORD_PRECISION)},${quantize(input.origin[1], LIVE_CACHE_COORD_PRECISION)}`
            : "no-origin",
          String(input.openNow ?? false),
        ]
      : ["planning", input.category, input.encodedPolyline];

  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
};

/** Default store, backed by Postgres via the shared place cache. */
export const postgresSuggestionStore: SuggestionStore = {
  readCache: (cacheKey, options) =>
    readPlaceCache<StopSuggestion[]>(cacheKey, options),
  writeCache: (cacheKey, category, suggestions, ttlMs) =>
    writePlaceCache(cacheKey, category, suggestions, ttlMs),
  reserveCall: (limit) => reserveGoogleCall(USAGE_API, limit),
};

/**
 * Maps raw places onto the route, drops anything too far off it, and orders by
 * how far into the ride the stop falls.
 */
const toOrderedSuggestions = (
  places: PlaceResult[],
  polyline: LatLng[],
  limit: number,
): StopSuggestion[] => {
  const cumulative = cumulativeDistances(polyline);

  return places
    .map((place) => {
      const projection = projectOntoPolyline(
        { lat: place.lat, lng: place.lng },
        polyline,
        cumulative,
      );
      return {
        google_place_id: place.google_place_id,
        name: place.name,
        address: place.address,
        coords: [place.lng, place.lat] as [number, number],
        distance_along_route_m: Math.round(projection.distanceAlongMeters),
        detour_from_route_m: Math.round(projection.offsetMeters),
      };
    })
    .filter((suggestion) => suggestion.detour_from_route_m <= MAX_DETOUR_METERS)
    .sort((a, b) => a.distance_along_route_m - b.distance_along_route_m)
    .slice(0, limit);
};

const isLoopRoute = (polyline: LatLng[]): boolean =>
  polyline.length >= 2 &&
  haversineMeters(polyline[0]!, polyline[polyline.length - 1]!) <
    LOOP_THRESHOLD_METERS;

/** Splits a loop into two open half-routes, each of which Google can search. */
const splitPolyline = (polyline: LatLng[]): [LatLng[], LatLng[]] => {
  const midpoint = Math.floor(polyline.length / 2);
  return [polyline.slice(0, midpoint + 1), polyline.slice(midpoint)];
};

/**
 * Finds places along a route, by category.
 *
 * Never throws for expected failure modes: a budget stop, a quota refusal, or a
 * Places outage all resolve to `degraded: true` with whatever cached results
 * exist, so the caller can fall back to manual search instead of erroring.
 */
export const getStopSuggestions = async (
  input: StopSuggestionQueryInput,
  deps: StopSuggestionDeps,
): Promise<StopSuggestionResult> => {
  const store = deps.store ?? postgresSuggestionStore;
  const cacheKey = buildCacheKey(input);

  const fresh = await store.readCache(cacheKey, { allowStale: false });
  if (fresh) return { suggestions: fresh, cached: true, degraded: false };

  const dailyCallLimit = resolveMaxDailyCalls(deps.maxDailyCalls);
  const polyline = decodePolyline(input.encodedPolyline);

  if (polyline.length < 2) {
    return { suggestions: [], cached: false, degraded: false };
  }

  const degradedFallback = async (
    reason: string,
  ): Promise<StopSuggestionResult> => {
    console.warn(`Stop suggestions degraded (${reason}) for key ${cacheKey}`);
    const stale = await store.readCache(cacheKey, { allowStale: true });
    return { suggestions: stale ?? [], cached: stale !== null, degraded: true };
  };

  const runSearch = async (encoded: string): Promise<PlaceResult[] | null> => {
    if (!(await store.reserveCall(dailyCallLimit))) return null;
    return searchAlongRoute(
      {
        textQuery: CATEGORY_QUERIES[input.category],
        encodedPolyline: encoded,
        openNow: input.openNow,
        pageSize: input.limit,
      },
      deps.apiKey,
      deps.fetchImpl,
    );
  };

  try {
    let places = await runSearch(input.encodedPolyline);
    if (places === null) return degradedFallback("daily budget reached");

    // Google documents that a route whose origin and destination coincide may
    // return nothing. Loops are ordinary for group rides, so search each half.
    if (places.length === 0 && isLoopRoute(polyline)) {
      const [firstHalf, secondHalf] = splitPolyline(polyline);
      const halves = await Promise.all([
        runSearch(encodePolyline(firstHalf)),
        runSearch(encodePolyline(secondHalf)),
      ]);

      if (halves.some((half) => half === null)) {
        return degradedFallback("daily budget reached during loop fallback");
      }

      const seen = new Set<string>();
      places = halves.flatMap((half) => half ?? []).filter((place) => {
        if (seen.has(place.google_place_id)) return false;
        seen.add(place.google_place_id);
        return true;
      });
    }

    const suggestions = toOrderedSuggestions(places, polyline, input.limit);

    await store.writeCache(
      cacheKey,
      input.category,
      suggestions,
      input.mode === "live" ? CACHE_TTL_LIVE_MS : CACHE_TTL_PLANNING_MS,
    );

    return { suggestions, cached: false, degraded: false };
  } catch (error) {
    if (error instanceof PlacesApiError) {
      return degradedFallback(
        error.isQuotaFailure ? `quota/permission: ${error.message}` : error.message,
      );
    }
    throw error;
  }
};
