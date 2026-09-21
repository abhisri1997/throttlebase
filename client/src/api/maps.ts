import * as Crypto from "expo-crypto";
import { apiClient } from "./client";

/**
 * Typed access to the backend maps proxy.
 *
 * The app holds no Google key: every Directions, Geocoding and Places call goes
 * through `api.throttlebase.in`, which owns the key, the cache and the daily
 * budget. Nothing here should ever call googleapis.com directly again.
 */

export interface MapsLatLng {
  lat: number;
  lng: number;
}

export interface MapsDirectionsStep {
  instructionHtml: string;
  distanceMeters: number;
  durationSeconds: number;
  startLocation: MapsLatLng;
  endLocation: MapsLatLng;
  polyline: string;
  maneuver?: string;
}

export interface MapsDirectionsLeg {
  startLocation: MapsLatLng;
  endLocation: MapsLatLng;
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds?: number;
  steps: MapsDirectionsStep[];
}

export interface MapsDirectionsRoute {
  overviewPolyline?: string;
  legs: MapsDirectionsLeg[];
}

export interface MapsDirectionsResponse {
  routes: MapsDirectionsRoute[];
}

export interface MapsDirectionsRequest {
  origin: MapsLatLng;
  destination: MapsLatLng;
  waypoints?: MapsLatLng[];
  preferFastest?: boolean;
  trafficAware?: boolean;
}

export interface PlacePrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** The server's code for "budget or rate limit reached"; the UI asks the rider to retry. */
export const MAPS_QUOTA_CODE = "maps_quota";

/**
 * True when a failure was a quota refusal rather than a real outage.
 *
 * Checks the HTTP status as well as the body code, because the rate limiter
 * answers 429 through express-rate-limit rather than our own handler.
 */
export const isMapsQuotaError = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })
    ?.response;
  return response?.status === 429 || response?.data?.code === MAPS_QUOTA_CODE;
};

export const fetchDirections = async (
  request: MapsDirectionsRequest,
): Promise<MapsDirectionsResponse> => {
  const { data } = await apiClient.post<MapsDirectionsResponse>(
    "/api/maps/directions",
    request,
  );
  return data;
};

export const fetchReverseGeocode = async (
  lat: number,
  lng: number,
): Promise<string | null> => {
  const { data } = await apiClient.get<{ formattedAddress: string | null }>(
    "/api/maps/reverse-geocode",
    { params: { lat, lng } },
  );
  return data.formattedAddress;
};

export const fetchPlacePredictions = async (
  input: string,
  sessionToken: string,
  locationBias?: { lat: number; lng: number; radiusM: number },
): Promise<PlacePrediction[]> => {
  const { data } = await apiClient.post<{ predictions: PlacePrediction[] }>(
    "/api/maps/places/autocomplete",
    { input, sessionToken, ...(locationBias ? { locationBias } : {}) },
  );
  return data.predictions;
};

export const fetchPlaceDetails = async (
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> => {
  const { data } = await apiClient.get<PlaceDetails>(
    `/api/maps/places/${encodeURIComponent(placeId)}`,
    { params: sessionToken ? { sessionToken } : undefined },
  );
  return data;
};

/**
 * A new Places session token.
 *
 * Google bills autocomplete keystrokes and the details call that follows as one
 * session, so a token must cover exactly one search-and-pick. The caller starts
 * a fresh one after a selection and when the picker closes.
 */
export const createPlacesSessionToken = (): string => Crypto.randomUUID();
