import { z } from "zod";

export const REPORT_TARGET_TYPES = ["post", "comment", "rider", "ride", "route", "group"] as const;
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "dangerous_riding",
  "impersonation",
  "other",
] as const;

export const CreateReportSchema = z.object({
  target_type: z.enum(REPORT_TARGET_TYPES),
  target_id: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(1000).optional(),
  /** Block whoever made it, in the same step. */
  also_block: z.boolean().optional(),
});

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type CreateReportInput = z.infer<typeof CreateReportSchema>;
