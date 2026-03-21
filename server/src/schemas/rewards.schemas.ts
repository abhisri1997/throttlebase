import { z } from 'zod/v4';

export const CreateBadgeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon_url: z.string().url().optional(),
  criteria_type: z.string().min(1).max(50),
  criteria_value: z.number().positive(),
});
export type CreateBadgeInput = z.infer<typeof CreateBadgeSchema>;

export const CreateAchievementSchema = z.object({
  name: z.string().min(1).max(100),
  tier: z.number().int().min(1).max(10),
  threshold: z.number().positive(),
  criteria_type: z.string().min(1).max(50),
  reward_description: z.string().max(500).optional(),
});
export type CreateAchievementInput = z.infer<typeof CreateAchievementSchema>;
