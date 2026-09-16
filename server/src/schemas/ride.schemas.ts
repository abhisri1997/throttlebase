import { z } from 'zod';

/**
 * PostGIS point order: [longitude, latitude]. Bounds are enforced here because
 * these coordinates feed route geometry — an out-of-range value silently
 * produces nonsense distances rather than failing loudly.
 */
const LngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

/** Shared shape for a stop the captain planned or a rider requested. */
const StopFieldsSchema = {
  location_coords: LngLatSchema,
  name: z.string().max(255).optional(),
  address: z.string().max(512).optional(),
  google_place_id: z.string().max(255).optional(),
};

export const CreateRideSchema = z.object({
  title: z.string().min(3, 'Title is too short').max(255),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduled_at: z.string().datetime({ message: 'Must be a valid ISO DateTime string' }),
  estimated_duration_min: z.number().int().positive().optional(),
  max_capacity: z.number().int().positive().optional(),
  // For PostGIS points (longitude, latitude)
  start_point_coords: LngLatSchema.optional(),
  start_point_name: z.string().max(255).optional(),
  end_point_coords: LngLatSchema.optional(),
  end_point_name: z.string().max(255).optional(),
  start_point_auto: z.boolean().default(false),
  // Structured requirements
  requirements: z.object({
    min_experience: z.enum(['beginner', 'intermediate', 'expert']).optional(),
    mandatory_gear: z.array(z.string()).optional(),
    vehicle_type: z.string().optional(),
  }).optional(),
  // Pre-planned intermediate stops
  stops: z.array(z.object({
    type: z.enum(['fuel', 'rest', 'photo']),
    ...StopFieldsSchema,
  })).optional(),
});

export const UpdateRideSchema = CreateRideSchema.partial().extend({
  status: z.enum(['draft', 'scheduled', 'active', 'completed', 'cancelled']).optional(),
});

export const PromoteCoCaptainSchema = z.object({
  rider_id: z.string().uuid('Must be a valid UUID'),
});

export const RequestStopSchema = z.object({
  type: z.enum(['fuel', 'rest', 'photo', 'unplanned']),
  ...StopFieldsSchema,
});

/** A regroup is always a rest stop; the estimate is only there for the prompt. */
export const RequestRegroupSchema = z.object({
  ...StopFieldsSchema,
  wait_seconds: z.number().int().min(0).nullish(),
  /**
   * A stop the ride was already making. There is nothing for the leaders to
   * approve — everyone planned to pull in there — so the request only tells
   * them somebody is behind, and no new stop is created.
   */
  existing_stop_id: z.string().uuid('Must be a valid UUID').nullish(),
});

export const HandleStopSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export type CreateRideInput = z.infer<typeof CreateRideSchema>;
export type UpdateRideInput = z.infer<typeof UpdateRideSchema>;
export type PromoteCoCaptainInput = z.infer<typeof PromoteCoCaptainSchema>;
export type RequestStopInput = z.infer<typeof RequestStopSchema>;
export type RequestRegroupInput = z.infer<typeof RequestRegroupSchema>;
export type HandleStopInput = z.infer<typeof HandleStopSchema>;
