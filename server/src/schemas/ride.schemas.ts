import { z } from 'zod';

export const CreateRideSchema = z.object({
  title: z.string().min(3, 'Title is too short').max(255),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  scheduled_at: z.string().datetime({ message: 'Must be a valid ISO DateTime string' }),
  estimated_duration_min: z.number().int().positive().optional(),
  max_capacity: z.number().int().positive().optional(),
  // For PostGIS points (longitude, latitude)
  start_point_coords: z.tuple([z.number(), z.number()]).optional(),
  end_point_coords: z.tuple([z.number(), z.number()]).optional(),
  // requirements JSON mapping e.g. {"min_experience": "intermediate"}
  requirements: z.record(z.string(), z.any()).optional(),
});

export const UpdateRideSchema = CreateRideSchema.partial().extend({
  status: z.enum(['draft', 'scheduled', 'active', 'completed', 'cancelled']).optional(),
});

export type CreateRideInput = z.infer<typeof CreateRideSchema>;
export type UpdateRideInput = z.infer<typeof UpdateRideSchema>;
