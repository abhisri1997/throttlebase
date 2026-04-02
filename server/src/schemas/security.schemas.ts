import { z } from "zod/v4";

export const VerifyTotpSchema = z.object({
  token: z.string().length(6, "TOTP token must be 6 digits").regex(/^\d+$/, "Token must be numeric"),
});

export const DisableTotpSchema = z.object({
  password: z.string().min(1, "Password is required"),
  token: z.string().length(6, "TOTP token must be 6 digits").regex(/^\d+$/, "Token must be numeric"),
});

export type VerifyTotpInput = z.infer<typeof VerifyTotpSchema>;
export type DisableTotpInput = z.infer<typeof DisableTotpSchema>;
