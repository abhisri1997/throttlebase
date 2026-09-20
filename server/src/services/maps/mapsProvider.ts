/**
 * The port every outbound Google call goes through.
 *
 * Nothing outside `maps/googleMapsProvider.ts` may talk to Google directly.
 * Keeping the boundary here is what lets the HTTP layer be tested without a
 * network, and what keeps the API key from leaking into call sites: the key is
 * bound once when the adapter is built, never passed around per request.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/**
 * Why an upstream call failed, in the only terms callers act on.
 *
 * `quota` is separated from everything else because it is the one failure the
 * client is expected to retry later rather than treat as broken.
 */
export type MapsErrorKind = "quota" | "denied" | "upstream" | "network";

export class MapsApiError extends Error {
  constructor(
    message: string,
    readonly kind: MapsErrorKind,
    /** Upstream HTTP status, or 0 when the request never completed. */
    readonly httpStatus: number,
    /** Google's own status string (e.g. REQUEST_DENIED), when it sent one. */
    readonly upstreamStatus?: string | undefined,
  ) {
    super(message);
    this.name = "MapsApiError";
  }

  /** Quota and permission failures both cost money to rediscover, so both are tracked. */
  get isQuotaFailure(): boolean {
    return this.kind === "quota" || this.kind === "denied";
  }
}

/* -------------------------------------------------------------------------- */
/* Directions                                                                  */
/* -------------------------------------------------------------------------- */

export interface DirectionsRequest {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  /** Stopovers. Each one adds a leg to every returned route. */
  waypoints?: LatLngLiteral[] | undefined;
  /**
   * Ask Google for alternative routes so the caller can pick the fastest.
   * Google only returns alternatives for requests without stopovers.
   */
  preferFastest?: boolean | undefined;
  /**
   * Ask for traffic-aware durations. Billed at the Directions Advanced rate and
   * only returned for requests without stopovers, so callers set it deliberately.
   */
  trafficAware?: boolean | undefined;
}

export interface DirectionsStep {
  /**
   * Google's instruction markup, passed through as a mapped field rather than
   * parsed here: the client already owns the formatting rules that turn it into
   * a primary line, a road name and a note.
   */
  instructionHtml: string;
  distanceMeters: number;
  durationSeconds: number;
  startLocation: LatLngLiteral;
  endLocation: LatLngLiteral;
  /** Encoded polyline for this step alone. */
  polyline: string;
  maneuver?: string | undefined;
}

export interface DirectionsLeg {
  startLocation: LatLngLiteral;
  endLocation: LatLngLiteral;
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds?: number | undefined;
  steps: DirectionsStep[];
}

export interface DirectionsRoute {
  /** Google's pre-simplified overview line; the right corridor for search-along-route. */
  overviewPolyline?: string | undefined;
  legs: DirectionsLeg[];
}

export interface DirectionsResult {
  routes: DirectionsRoute[];
}

/* -------------------------------------------------------------------------- */
/* Places                                                                      */
/* -------------------------------------------------------------------------- */

export interface AutocompleteRequest {
  input: string;
  /** Ties autocomplete keystrokes and the following details call into one billed session. */
  sessionToken: string;
  locationBias?: { lat: number; lng: number; radiusM: number } | undefined;
}

export interface PlacePrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

export interface PlaceDetailsRequest {
  placeId: string;
  /** Must match the token used for autocomplete; this call ends the session. */
  sessionToken?: string | undefined;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

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

export interface SearchNearbyParams {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Nearby Search takes up to 50 types in ONE call (Text Search takes one). */
  includedTypes: string[];
  maxResultCount?: number | undefined;
}

/* -------------------------------------------------------------------------- */

export interface MapsProvider {
  getDirections(request: DirectionsRequest): Promise<DirectionsResult>;
  /** Resolves to null when Google has no address for the point. */
  reverseGeocode(coords: LatLngLiteral): Promise<string | null>;
  autocompletePlaces(request: AutocompleteRequest): Promise<PlacePrediction[]>;
  /** Resolves to null when the place id is unknown or returns no coordinates. */
  getPlaceDetails(request: PlaceDetailsRequest): Promise<PlaceDetails | null>;
  searchAlongRoute(params: SearchAlongRouteParams): Promise<PlaceResult[]>;
  searchNearby(params: SearchNearbyParams): Promise<PlaceResult[]>;
}

/** Injectable for tests, so call counts can be asserted without hitting Google. */
export type FetchLike = typeof fetch;
