import { z } from "zod";
import { CONSENT_PURPOSES } from "../core/consent/notices.js";

/** Sources the app may claim. Consent Managers and the system write through their own paths. */
const APP_CONSENT_SOURCES = ["onboarding", "contextual", "settings"] as const;
const APP_DECLARATION_SOURCES = ["onboarding", "settings"] as const;

const clientInfo = {
  app_version: z.string().trim().max(40).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
};

export const ConsentPurposeParam = z.enum(CONSENT_PURPOSES);

export const ConsentAnswerSchema = z.object({
  granted: z.boolean(),
  /** The version of the notice the rider was shown. */
  notice_version: z.string().trim().min(1).max(40),
  source: z.enum(APP_CONSENT_SOURCES),
  ...clientInfo,
});

export const DeclarationSchema = z.object({
  kind: z.enum(["age_18_plus"]),
  answer: z.boolean(),
  source: z.enum(APP_DECLARATION_SOURCES),
  app_version: clientInfo.app_version,
});

export type ConsentAnswerInput = z.infer<typeof ConsentAnswerSchema>;
export type DeclarationBody = z.infer<typeof DeclarationSchema>;
