import { assertLegacyStatus, requestGoogleJson } from "./googleHttp.js";
import {
  type AutocompleteRequest,
  type DirectionsLeg,
  type DirectionsRequest,
  type DirectionsResult,
  type DirectionsRoute,
  type DirectionsStep,
  type FetchLike,
  type LatLngLiteral,
  type MapsProvider,
  type PlaceDetails,
  type PlaceDetailsRequest,
  type PlacePrediction,
  type PlaceResult,
  type SearchAlongRouteParams,
  type SearchNearbyParams,
} from "./mapsProvider.js";

/**
 * The only module in the codebase that talks to Google.
 *
 * Places API (New) is used for search, autocomplete and details; the legacy
 * `maps/api/place/*` endpoints cannot be enabled on Cloud projects created
 * after March 2025 and are not available to this project at all. Directions and
 * Geocoding stay on the v3 JSON APIs, whose per-day quota is 10x the v4
 * Geocoding endpoints'.
 */

export const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
export const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
export const PLACES_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
export const PLACES_SEARCH_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
export const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
export const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

/**
 * Pro-tier field mask for search.
 *
 * Billing is at the highest SKU any requested field touches. Adding
 * `places.rating`, `places.userRatingCount`, or any opening-hours field moves
 * the entire request to Enterprise, whose free monthly allowance is 5x smaller
 * (1,000 vs 5,000 requests). Keep this Pro-only unless that trade is deliberate.
 *
 * `openNow` is a request-body flag rather than a field, so filtering by it
 * costs nothing extra.
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
].join(",");

/**
 * Details field mask. Deliberately the four fields the picker needs and no
 * more: each additional field can raise the SKU for every details call.
 */
export const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
].join(",");

/** Places (New) caps a page at 20 results, and 60 across all pages. */
export const MAX_PAGE_SIZE = 20;

/** Matches the country filter the previous autocomplete widget applied. */
const AUTOCOMPLETE_REGION_CODES = ["in"];

const LANGUAGE_CODE = "en";

/* -------------------------------------------------------------------------- */
/* Google wire shapes                                                          */
/* -------------------------------------------------------------------------- */

interface GoogleLatLng {
  lat?: number;
  lng?: number;
}

interface GoogleDirectionsStep {
  html_instructions?: string;
  distance?: { value?: number };
  duration?: { value?: number };
  start_location?: GoogleLatLng;
  end_location?: GoogleLatLng;
  polyline?: { points?: string };
  maneuver?: string;
}

interface GoogleDirectionsLeg {
  start_location?: GoogleLatLng;
  end_location?: GoogleLatLng;
  distance?: { value?: number };
  duration?: { value?: number };
  duration_in_traffic?: { value?: number };
  steps?: GoogleDirectionsStep[];
}

interface GoogleDirectionsResponse {
  status?: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: GoogleDirectionsLeg[];
  }>;
}

interface GoogleGeocodeResponse {
  status?: string;
  error_message?: string;
  results?: Array<{ formatted_address?: string }>;
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

interface GoogleAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
}

/* -------------------------------------------------------------------------- */
/* Mapping helpers                                                             */
/* -------------------------------------------------------------------------- */

const toLatLng = (value: GoogleLatLng | undefined): LatLngLiteral | null =>
  typeof value?.lat === "number" && typeof value.lng === "number"
    ? { lat: value.lat, lng: value.lng }
    : null;

const toCoordParam = (point: LatLngLiteral): string => `${point.lat},${point.lng}`;

const toPlaceResult = (place: GooglePlace): PlaceResult | null => {
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
 * Maps one Google step. Steps missing coordinates or a polyline are dropped:
 * the client draws the line from these, and a gap would render as a shortcut
 * through whatever lies between.
 */
const toStep = (step: GoogleDirectionsStep): DirectionsStep | null => {
  const start = toLatLng(step.start_location);
  const end = toLatLng(step.end_location);
  const polyline = step.polyline?.points;

  if (!start || !end || !polyline) return null;

  return {
    instructionHtml: step.html_instructions ?? "",
    distanceMeters: step.distance?.value ?? 0,
    durationSeconds: step.duration?.value ?? 0,
    startLocation: start,
    endLocation: end,
    polyline,
    ...(step.maneuver !== undefined ? { maneuver: step.maneuver } : {}),
  };
};

const toLeg = (leg: GoogleDirectionsLeg): DirectionsLeg | null => {
  const steps = (leg.steps ?? [])
    .map(toStep)
    .filter((step): step is DirectionsStep => step !== null);

  const start = toLatLng(leg.start_location) ?? steps[0]?.startLocation ?? null;
  const end = toLatLng(leg.end_location) ?? steps[steps.length - 1]?.endLocation ?? null;

  if (!start || !end) return null;

  return {
    startLocation: start,
    endLocation: end,
    distanceMeters: leg.distance?.value ?? 0,
    durationSeconds: leg.duration?.value ?? 0,
    ...(typeof leg.duration_in_traffic?.value === "number"
      ? { durationInTrafficSeconds: leg.duration_in_traffic.value }
      : {}),
    steps,
  };
};

/* -------------------------------------------------------------------------- */

export interface GoogleMapsProviderOptions {
  apiKey: string;
  fetchImpl?: FetchLike | undefined;
}

/**
 * Builds the Google-backed provider. The key is captured here and never
 * returned, logged, or passed to a caller.
 */
export const createGoogleMapsProvider = ({
  apiKey,
  fetchImpl = fetch,
}: GoogleMapsProviderOptions): MapsProvider => {
  const placesHeaders = (fieldMask: string): Record<string, string> => ({
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": fieldMask,
  });

  const searchPlaces = async (
    label: string,
    url: string,
    body: Record<string, unknown>,
  ): Promise<PlaceResult[]> => {
    const data = await requestGoogleJson<{ places?: GooglePlace[] }>(
      label,
      url,
      {
        method: "POST",
        headers: placesHeaders(PLACES_FIELD_MASK),
        body: JSON.stringify(body),
      },
      fetchImpl,
    );

    // An empty body is a legitimate "nothing here", not an error. It is also
    // what a loop route (origin ~= destination) returns; callers handle that.
    return (data.places ?? [])
      .map(toPlaceResult)
      .filter((place): place is PlaceResult => place !== null);
  };

  return {
    async getDirections(request: DirectionsRequest): Promise<DirectionsResult> {
      const waypoints = request.waypoints ?? [];
      const hasStopovers = waypoints.length > 0;

      const params = new URLSearchParams({
        origin: toCoordParam(request.origin),
        destination: toCoordParam(request.destination),
        mode: "driving",
        key: apiKey,
      });

      if (hasStopovers) {
        params.set("waypoints", waypoints.map(toCoordParam).join("|"));
      }

      // Google returns traffic and alternatives only for requests without
      // stopovers, yet still bills `departure_time` at the Directions Advanced
      // rate. Only ask where the answer can actually come back.
      if (!hasStopovers && request.trafficAware) {
        params.set("departure_time", "now");
      }

      if (!hasStopovers && request.preferFastest) {
        params.set("alternatives", "true");
      }

      const payload = await requestGoogleJson<GoogleDirectionsResponse>(
        "directions",
        `${DIRECTIONS_URL}?${params.toString()}`,
        { method: "GET" },
        fetchImpl,
      );

      assertLegacyStatus("directions", payload);

      const routes = (payload.routes ?? [])
        .map((route): DirectionsRoute | null => {
          const legs = (route.legs ?? [])
            .map(toLeg)
            .filter((leg): leg is DirectionsLeg => leg !== null);

          if (legs.length === 0) return null;

          return {
            ...(route.overview_polyline?.points !== undefined
              ? { overviewPolyline: route.overview_polyline.points }
              : {}),
            legs,
          };
        })
        .filter((route): route is DirectionsRoute => route !== null);

      return { routes };
    },

    async reverseGeocode(coords: LatLngLiteral): Promise<string | null> {
      const params = new URLSearchParams({
        latlng: toCoordParam(coords),
        key: apiKey,
      });

      const payload = await requestGoogleJson<GoogleGeocodeResponse>(
        "reverse-geocode",
        `${GEOCODE_URL}?${params.toString()}`,
        { method: "GET" },
        fetchImpl,
      );

      assertLegacyStatus("reverse-geocode", payload);

      return payload.results?.[0]?.formatted_address ?? null;
    },

    async autocompletePlaces(request: AutocompleteRequest): Promise<PlacePrediction[]> {
      const body: Record<string, unknown> = {
        input: request.input,
        sessionToken: request.sessionToken,
        includedRegionCodes: AUTOCOMPLETE_REGION_CODES,
        languageCode: LANGUAGE_CODE,
      };

      if (request.locationBias) {
        body.locationBias = {
          circle: {
            center: {
              latitude: request.locationBias.lat,
              longitude: request.locationBias.lng,
            },
            radius: request.locationBias.radiusM,
          },
        };
      }

      // Autocomplete has a fixed response shape, so it takes no field mask.
      const data = await requestGoogleJson<GoogleAutocompleteResponse>(
        "places-autocomplete",
        PLACES_AUTOCOMPLETE_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify(body),
        },
        fetchImpl,
      );

      return (data.suggestions ?? [])
        .map((suggestion): PlacePrediction | null => {
          const prediction = suggestion.placePrediction;
          const placeId = prediction?.placeId;
          if (!placeId) return null;

          const structured = prediction.structuredFormat;
          return {
            placeId,
            // Fall back to the flat prediction text so a result is never blank.
            primaryText: structured?.mainText?.text ?? prediction.text?.text ?? "",
            secondaryText: structured?.secondaryText?.text ?? "",
          };
        })
        .filter((prediction): prediction is PlacePrediction => prediction !== null);
    },

    async getPlaceDetails(request: PlaceDetailsRequest): Promise<PlaceDetails | null> {
      const params = new URLSearchParams({ languageCode: LANGUAGE_CODE });
      if (request.sessionToken) {
        params.set("sessionToken", request.sessionToken);
      }

      const place = await requestGoogleJson<GooglePlace>(
        "place-details",
        `${PLACES_DETAILS_URL}/${encodeURIComponent(request.placeId)}?${params.toString()}`,
        { method: "GET", headers: placesHeaders(PLACE_DETAILS_FIELD_MASK) },
        fetchImpl,
      );

      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;

      return {
        placeId: place.id ?? request.placeId,
        name: place.displayName?.text || place.formattedAddress || "Selected Location",
        address: place.formattedAddress || "",
        lat,
        lng,
      };
    },

    /**
     * Runs a Text Search restricted to the corridor of an encoded route
     * polyline. Google ranks these by minimal detour time automatically.
     *
     * Results are NOT guaranteed to lie on the route — Google explicitly allows
     * alternate paths — so callers must apply their own on-route filter.
     */
    searchAlongRoute(params: SearchAlongRouteParams): Promise<PlaceResult[]> {
      const body: Record<string, unknown> = {
        textQuery: params.textQuery,
        searchAlongRouteParameters: {
          polyline: { encodedPolyline: params.encodedPolyline },
        },
        pageSize: Math.min(params.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE),
      };

      if (params.openNow) body.openNow = true;

      return searchPlaces("places-search-text", PLACES_SEARCH_TEXT_URL, body);
    },

    /**
     * Finds places near a point.
     *
     * The legacy endpoint this replaces accepted a single type per request, so
     * covering four categories cost four sequential calls. Nearby Search (New)
     * takes them all at once, which is a 4x reduction before caching.
     */
    searchNearby(params: SearchNearbyParams): Promise<PlaceResult[]> {
      return searchPlaces("places-search-nearby", PLACES_SEARCH_NEARBY_URL, {
        includedTypes: params.includedTypes,
        maxResultCount: params.maxResultCount ?? 1,
        locationRestriction: {
          circle: {
            center: { latitude: params.lat, longitude: params.lng },
            radius: params.radiusMeters,
          },
        },
      });
    },
  };
};
