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
});

export type SaveRouteFromRideInput = z.infer<typeof SaveRouteFromRideSchema>;
