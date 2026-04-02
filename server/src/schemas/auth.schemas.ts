import { z } from "zod/v4";

/**
 * Registration schema — validates incoming registration requests.
 *
 * Learning Note:
 * Zod gives us BOTH runtime validation AND TypeScript types from
 * the same definition. This is the "single source of truth" pattern.
 */
export const RegisterSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be 100 characters or less"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be 50 characters or less")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username may only contain letters, numbers, and underscores",
    ),
});

/**
 * Login schema — validates incoming login requests.
 * Accepts either `email` (backward compat) or `identifier` (email/username).
 */
export const LoginSchema = z
  .object({
    email: z.email().optional(),
    identifier: z.string().trim().min(1).optional(),
    password: z.string().min(1, "Password is required"),
    totp_token: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Two-factor token must be 6 digits")
      .optional(),
  })
  .transform((data) => ({
    identifier: data.identifier || data.email || "",
    password: data.password,
    totp_token: data.totp_token,
  }))
  .superRefine((data, ctx) => {
    if (!data.identifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email or username is required",
      });
    }
  });

// Infer TypeScript types from the schemas
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
