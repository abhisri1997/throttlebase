import { z } from "zod";
import { MAX_REASON_LENGTH } from "../core/moderation/actions.js";
import { REPORT_TARGET_TYPES } from "./report.schemas.js";

export const ModerationActionSchema = z.object({
  target_type: z.enum(REPORT_TARGET_TYPES),
  target_id: z.string().uuid(),
  action: z.enum(["remove", "dismiss", "suspend", "lift_suspension"]),
  reason: z.string().max(MAX_REASON_LENGTH),
});
