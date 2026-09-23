import { z } from "zod";

/**
 * Request validation for the /api/maps proxy.
 *
 * Everything here is a boundary against spending money on a malformed request:
 * each rejected input is an outbound Google call that never happens.
 */

/** Directions bills per request regardless of waypoint count, but the payload still needs a bound. */
export const MAX_WAYPOINTS = 10;

/** Longer autocomplete input buys no better predictions and only widens the attack surface. */
export const MAX_AUTOCOMPLETE_INPUT_LENGTH = 100;

/** Google place ids are short opaque strings; this only bounds the path segment. */
const MAX_PLACE_ID_LENGTH = 512;

const LatitudeSchema = z.number().min(-90).max(90);
const LongitudeSchema = z.number().min(-180).max(180);

export const LatLngSchema = z.object({
  lat: LatitudeSchema,
  lng: LongitudeSchema,
});

export const DirectionsRequestSchema = z.object({
  origin: LatLngSchema,
  destination: LatLngSchema,
  waypoints: z.array(LatLngSchema).max(MAX_WAYPOINTS).optional(),
  preferFastest: z.boolean().optional(),
  trafficAware: z.boolean().optional(),
});

export type DirectionsRequestInput = z.infer<typeof DirectionsRequestSchema>;

/** Query strings arrive as text, so coordinates are coerced before range checking. */
export const ReverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().pipe(LatitudeSchema),
  lng: z.coerce.number().pipe(LongitudeSchema),
});

export type ReverseGeocodeQueryInput = z.infer<typeof ReverseGeocodeQuerySchema>;

export const AutocompleteRequestSchema = z.object({
  input: z.string().trim().min(1).max(MAX_AUTOCOMPLETE_INPUT_LENGTH),
  sessionToken: z.string().uuid("sessionToken must be a UUID"),
  locationBias: z
    .object({
      lat: LatitudeSchema,
      lng: LongitudeSchema,
      radiusM: z.number().positive().max(50000),
    })
    .optional(),
});

export type AutocompleteRequestInput = z.infer<typeof AutocompleteRequestSchema>;

export const PlaceDetailsParamsSchema = z.object({
  placeId: z.string().trim().min(1).max(MAX_PLACE_ID_LENGTH),
});

export const PlaceDetailsQuerySchema = z.object({
  sessionToken: z.string().uuid("sessionToken must be a UUID").optional(),
});
