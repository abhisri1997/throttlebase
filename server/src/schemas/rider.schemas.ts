import { z } from 'zod/v4';

/**
 * UpdateRiderSchema — validates PATCH /api/riders/me requests.
 *
 * Learning Note:
 * All fields are optional (PATCH semantics). Only the fields present
 * in the request body will be updated in the database. This prevents
 * accidental overwrites of untouched columns.
 */
export const UpdateRiderSchema = z.object({
  display_name: z
    .string()
    .min(1, 'Display name cannot be empty')
    .max(100, 'Display name must be 100 characters or less')
    .optional(),
  bio: z
    .string()
    .max(1000, 'Bio must be 1000 characters or less')
    .optional(),
  experience_level: z
    .enum(['beginner', 'intermediate', 'expert'])
    .optional(),
  location_city: z
    .string()
    .max(100)
    .optional(),
  location_region: z
    .string()
    .max(100)
    .optional(),
  phone_number: z
    .string()
    .max(20)
    .optional(),
  weight_kg: z
    .number()
    .positive('Weight must be positive')
    .max(500, 'Weight seems unrealistic')
    .optional(),
});

export type UpdateRiderInput = z.infer<typeof UpdateRiderSchema>;
