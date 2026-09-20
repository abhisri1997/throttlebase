import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AutocompleteRequestSchema,
  DirectionsRequestSchema,
  PlaceDetailsParamsSchema,
  PlaceDetailsQuerySchema,
  ReverseGeocodeQuerySchema,
} from "../schemas/maps.schemas.js";
import {
  autocompletePlaces,
  getDirections,
  getPlaceDetails,
  reverseGeocode,
} from "../services/maps.service.js";
import { MapsApiError, type MapsProvider } from "../services/maps/mapsProvider.js";
import { createGoogleMapsProvider } from "../services/maps/googleMapsProvider.js";

/**
 * HTTP surface for the Google proxy.
 *
 * Two rules hold for every handler: the API key never leaves the server, and no
 * upstream response body is ever forwarded. Clients get one of three shapes —
 * the mapped result, 429 `maps_quota`, or 502 `maps_upstream` — and the real
 * reason goes to the server log.
 */

const QUOTA_RESPONSE = {
  error: "Maps quota reached. Try again shortly.",
  code: "maps_quota",
} as const;

const UPSTREAM_RESPONSE = {
  error: "Maps service is unavailable.",
  code: "maps_upstream",
} as const;

let cachedProvider: MapsProvider | null = null;

/**
 * Builds the provider once per process. Returns null when the key is missing,
 * which is a deployment fault rather than a client one — it is logged loudly
 * and reported as an upstream failure.
 */
const resolveProvider = (): MapsProvider | null => {
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[maps] GOOGLE_MAPS_API_KEY is not configured; /api/maps is disabled.");
    return null;
  }

  cachedProvider = createGoogleMapsProvider({ apiKey });
  return cachedProvider;
};

/** Maps any thrown error onto the client-visible contract. */
const sendError = (res: Response, error: unknown, label: string): void => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "maps_invalid_request",
      details: error.issues,
    });
    return;
  }

  if (error instanceof MapsApiError) {
    if (error.kind === "quota") {
      res.status(429).json(QUOTA_RESPONSE);
      return;
    }

    // Kind and upstream status are already logged by the HTTP layer; this line
    // ties the failure to the endpoint the rider actually called.
    console.error(`[maps] ${label} failed as ${error.kind}`);
    res.status(502).json(UPSTREAM_RESPONSE);
    return;
  }

  console.error(`[maps] ${label} threw an unexpected error:`, error);
  res.status(500).json({ error: "Internal server error" });
};

/**
 * Runs a handler with the provider resolved, converting every failure mode into
 * the shared error contract.
 */
const withProvider = (
  label: string,
  handler: (provider: MapsProvider, req: Request, res: Response) => Promise<void>,
) => async (req: Request, res: Response): Promise<void> => {
  const provider = resolveProvider();
  if (!provider) {
    res.status(502).json(UPSTREAM_RESPONSE);
    return;
  }

  try {
    await handler(provider, req, res);
  } catch (error) {
    sendError(res, error, label);
  }
};

export const postDirections = withProvider("directions", async (provider, req, res) => {
  const validated = DirectionsRequestSchema.parse(req.body);
  const result = await getDirections(validated, { provider });
  res.status(200).json(result);
});

export const getReverseGeocode = withProvider("reverse-geocode", async (provider, req, res) => {
  const { lat, lng } = ReverseGeocodeQuerySchema.parse(req.query);
  const result = await reverseGeocode({ lat, lng }, { provider });
  res.status(200).json(result);
});

export const postPlacesAutocomplete = withProvider("places-autocomplete", async (provider, req, res) => {
  const validated = AutocompleteRequestSchema.parse(req.body);
  const predictions = await autocompletePlaces(validated, { provider });
  res.status(200).json({ predictions });
});

export const getPlace = withProvider("place-details", async (provider, req, res) => {
  const { placeId } = PlaceDetailsParamsSchema.parse(req.params);
  const { sessionToken } = PlaceDetailsQuerySchema.parse(req.query);

  const { details } = await getPlaceDetails(placeId, sessionToken, { provider });

  if (!details) {
    res.status(404).json({ error: "Place not found", code: "maps_place_not_found" });
    return;
  }

  res.status(200).json(details);
});
