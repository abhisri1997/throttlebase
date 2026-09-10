/**
 * Thin client for Google Places API (New) Text Search.
 *
 * This is a different API from the legacy Places endpoints still used by
 * utils/geo.ts. Legacy has no search-along-route capability at all, and cannot
 * be enabled on Cloud projects created after March 2025 — new work belongs here.
 *
 * Places API (New) must be enabled separately on the Cloud project.
 */

export const PLACES_SEARCH_TEXT_URL =
  "https://places.googleapis.com/v1/places:searchText";

export const PLACES_SEARCH_NEARBY_URL =
  "https://places.googleapis.com/v1/places:searchNearby";

/**
 * Pro-tier field mask.
 *
 * Billing is at the highest SKU any requested field touches. Adding
 * `places.rating`, `places.userRatingCount`, or any opening-hours field moves
 * the entire request to Enterprise, whose free monthly allowance is 5x smaller
 * (1,000 vs 5,000 requests). Keep this Pro-only unless that trade is deliberate.
 *
 * `openNow` is a request-body flag rather than a field, so filtering by it
 * costs nothing extra.
 */
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
].join(",");

/** Places (New) caps a page at 20 results, and 60 across all pages. */
export const MAX_PAGE_SIZE = 20;

export interface PlaceResult {
  google_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface SearchAlongRouteParams {
  /** Category phrase, e.g. "petrol pump". */
  textQuery: string;
  encodedPolyline: string;
  openNow?: boolean | undefined;
  pageSize?: number | undefined;
}

/** Injectable for tests, so call counts can be asserted without hitting Google. */
export type FetchLike = typeof fetch;

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    /** Quota/billing failures are worth surfacing distinctly — they cost money to rediscover. */
    readonly isQuotaFailure: boolean,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

interface PlacesApiPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

const toPlaceResult = (place: PlacesApiPlace): PlaceResult | null => {
  const id = place.id;
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;

  // A result without an id or coordinates cannot be mapped onto the route or
  // stored as a stop, so drop it rather than persisting a half-formed place.
  if (!id || typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    google_place_id: id,
    name: place.displayName?.text || place.formattedAddress || "Unnamed place",
    address: place.formattedAddress || "",
    lat,
    lng,
  };
};

/**
 * Runs a Text Search restricted to the corridor of an encoded route polyline.
 * Google ranks these by minimal detour time automatically.
 *
 * Results are NOT guaranteed to lie on the route — Google explicitly allows
 * alternate paths — so callers must apply their own on-route filter.
 */
export const searchAlongRoute = async (
  params: SearchAlongRouteParams,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<PlaceResult[]> => {
  const body: Record<string, unknown> = {
    textQuery: params.textQuery,
    searchAlongRouteParameters: {
      polyline: { encodedPolyline: params.encodedPolyline },
    },
    pageSize: Math.min(params.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE),
  };

  if (params.openNow) body.openNow = true;

  let response: Response;
  try {
    response = await fetchImpl(PLACES_SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new PlacesApiError(
      `Places request failed: ${error instanceof Error ? error.message : String(error)}`,
      0,
      false,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 429 is rate/quota; 403 is commonly an unenabled API or a restricted key.
    const isQuotaFailure = response.status === 429 || response.status === 403;
    throw new PlacesApiError(
      `Places responded ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
      response.status,
      isQuotaFailure,
    );
  }

  const data = (await response.json()) as { places?: PlacesApiPlace[] };

  // An empty body is a legitimate "nothing here", not an error. It is also what
  // a loop route (origin ~= destination) returns; callers handle that case.
  return (data.places ?? [])
    .map(toPlaceResult)
    .filter((place): place is PlaceResult => place !== null);
};

export interface SearchNearbyParams {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Nearby Search takes up to 50 types in ONE call (Text Search takes one). */
  includedTypes: string[];
  maxResultCount?: number | undefined;
}

/**
 * Finds places near a point.
 *
 * The legacy endpoint this replaces accepted a single type per request, so
 * covering four categories cost four sequential calls. Nearby Search (New)
 * takes them all at once, which is a 4x reduction before caching is considered.
 */
export const searchNearby = async (
  params: SearchNearbyParams,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<PlaceResult[]> => {
  let response: Response;
  try {
    response = await fetchImpl(PLACES_SEARCH_NEARBY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: params.includedTypes,
        maxResultCount: params.maxResultCount ?? 1,
        locationRestriction: {
          circle: {
            center: { latitude: params.lat, longitude: params.lng },
            radius: params.radiusMeters,
          },
        },
      }),
    });
  } catch (error) {
    throw new PlacesApiError(
      `Nearby search request failed: ${error instanceof Error ? error.message : String(error)}`,
      0,
      false,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const isQuotaFailure = response.status === 429 || response.status === 403;
    throw new PlacesApiError(
      `Nearby search responded ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
      response.status,
      isQuotaFailure,
    );
  }

  const data = (await response.json()) as { places?: PlacesApiPlace[] };

  return (data.places ?? [])
    .map(toPlaceResult)
    .filter((place): place is PlaceResult => place !== null);
};
