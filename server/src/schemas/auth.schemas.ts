import { z } from 'zod/v4';

/**
 * Registration schema — validates incoming registration requests.
 *
 * Learning Note:
 * Zod gives us BOTH runtime validation AND TypeScript types from
 * the same definition. This is the "single source of truth" pattern.
 */
export const RegisterSchema = z.object({
  email: z
    .email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
  display_name: z
    .string()
    .min(1, 'Display name is required')
    .max(100, 'Display name must be 100 characters or less'),
});

/**
 * Login schema — validates incoming login requests.
 */
export const LoginSchema = z.object({
  email: z
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

// Infer TypeScript types from the schemas
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
