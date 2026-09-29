import { z } from 'zod/v4';

/**
 * Route Schemas — Zod validation for routes and GPS traces.
 *
 * Learning Note:
 * GeoJSON LineString is the standard for representing a path on a map.
 * The coordinates array contains [longitude, latitude] pairs.
 */

export const CreateRouteSchema = z.object({
  title: z.string().min(1).max(255),
  geojson: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.array(z.number()).min(2).max(3)).min(2),
  }),
  ride_id: z.string().uuid().optional(),
  parent_route_id: z.string().uuid().optional(),
  distance_km: z.number().positive().optional(),
  elevation_gain_m: z.number().optional(),
  elevation_loss_m: z.number().optional(),
  difficulty: z.enum(['easy', 'moderate', 'hard']).optional(),
  visibility: z.enum(['private', 'specific_riders', 'public']).default('private'),
  proposal_status: z.enum(['pending', 'accepted', 'rejected', 'merged']).optional(),
});

export type CreateRouteInput = z.infer<typeof CreateRouteSchema>;

/** The owner changes who can see their route. */
export const UpdateRouteVisibilitySchema = z.object({
  visibility: z.enum(['private', 'specific_riders', 'public']),
});

export type RouteVisibility = z.infer<typeof UpdateRouteVisibilitySchema>['visibility'];

export const ShareRouteSchema = z.object({
  rider_id: z.string().uuid(),
});

export const GpsTracePointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude_m: z.number().optional(),
  speed_kmh: z.number().min(0).optional(),
  recorded_at: z.string().datetime(),
});

export const GpsTraceBatchSchema = z.object({
  ride_id: z.string().uuid(),
  traces: z.array(GpsTracePointSchema).min(1).max(500),
});

export type GpsTraceBatchInput = z.infer<typeof GpsTraceBatchSchema>;

/**
 * Why the rider who saved a route says it is good. Kept in step with the
 * routes_highlights_known check in migration 033.
 */
export const ROUTE_HIGHLIGHTS = [
  'scenic_road',
  'good_surface',
  'quiet',
  'well_lit',
  'great_stops',
  'twisties',
  'night_ride_friendly',
  'beginner_friendly',
] as const;

export type RouteHighlight = (typeof ROUTE_HIGHLIGHTS)[number];

/** A stop note is a line or two: "Last fuel for 60 km". */
export const MAX_STOP_NOTE_LENGTH = 280;

/** Saving the route a rider actually rode; the geometry comes from their own track. */
export const SaveRouteFromRideSchema = z.object({
  title: z.string().trim().min(1).max(255),
  visibility: z.enum(['private', 'public']).default('private'),
  highlights: z
    .array(z.enum(ROUTE_HIGHLIGHTS))
    .max(ROUTE_HIGHLIGHTS.length)
    .default([])
    .transform((highlights) => [...new Set(highlights)]),
  stop_notes: z
    .array(
      z.object({
        ride_stop_id: z.string().uuid(),
        note: z.string().trim().max(MAX_STOP_NOTE_LENGTH),
      }),
    )
    .max(50)
    .default([]),
  /**
   * The stops to keep, by the key the preview gave them, with an optional note
   * and, for a stop the rider found, a name. Left out, the route keeps the
   * planned stops ridden past, with stop_notes (what older apps send).
   */
  stops: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80),
        note: z.string().trim().max(MAX_STOP_NOTE_LENGTH).optional(),
        name: z.string().trim().max(255).optional(),
      }),
    )
    .max(50)
    .optional(),
});

export type SaveRouteFromRideInput = z.infer<typeof SaveRouteFromRideSchema>;

const latitude = z.coerce.number().min(-90).max(90).optional();
const longitude = z.coerce.number().min(-180).max(180).optional();
/** The picked place's label, e.g. "Wayanad, Kerala, India". */
const placeName = z.string().trim().min(1).max(200).optional();

/** GET /api/routes/search query string. Every part is optional. */
export const RouteSearchQuerySchema = z
  .object({
    from_lat: latitude,
    from_lng: longitude,
    from_name: placeName,
    to_lat: latitude,
    to_lng: longitude,
    to_name: placeName,
    min_km: z.coerce.number().min(0).max(5000).optional(),
    max_km: z.coerce.number().min(0).max(5000).optional(),
    /** Comma-separated, e.g. "scenic_road,great_stops". */
    highlights: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').map((part) => part.trim()).filter(Boolean) : []))
      .pipe(z.array(z.enum(ROUTE_HIGHLIGHTS)).max(ROUTE_HIGHLIGHTS.length)),
  })
  .refine((query) => (query.from_lat === undefined) === (query.from_lng === undefined), {
    message: 'from_lat and from_lng come together',
  })
  .refine((query) => (query.to_lat === undefined) === (query.to_lng === undefined), {
    message: 'to_lat and to_lng come together',
  })
  .refine(
    (query) => query.min_km === undefined || query.max_km === undefined || query.min_km <= query.max_km,
    { message: 'min_km must not exceed max_km' },
  );

export type RouteSearchQueryInput = z.infer<typeof RouteSearchQuerySchema>;
