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
