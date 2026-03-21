import { z } from 'zod';

export const CreateRideSchema = z.object({
  title: z.string().min(3, 'Title is too short').max(255),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduled_at: z.string().datetime({ message: 'Must be a valid ISO DateTime string' }),
  estimated_duration_min: z.number().int().positive().optional(),
  max_capacity: z.number().int().positive().optional(),
  // For PostGIS points (longitude, latitude)
  start_point_coords: z.tuple([z.number(), z.number()]).optional(),
  start_point_name: z.string().max(255).optional(),
  end_point_coords: z.tuple([z.number(), z.number()]).optional(),
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
    location_coords: z.tuple([z.number(), z.number()]),
    name: z.string().max(255).optional(),
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
  location_coords: z.tuple([z.number(), z.number()]),
  name: z.string().max(255).optional(),
});

export const HandleStopSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export type CreateRideInput = z.infer<typeof CreateRideSchema>;
export type UpdateRideInput = z.infer<typeof UpdateRideSchema>;
export type PromoteCoCaptainInput = z.infer<typeof PromoteCoCaptainSchema>;
export type RequestStopInput = z.infer<typeof RequestStopSchema>;
export type HandleStopInput = z.infer<typeof HandleStopSchema>;
