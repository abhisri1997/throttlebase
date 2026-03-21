import { z } from 'zod/v4';

export const UpdateSettingsSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  language: z.string().max(10).optional(),
  distance_unit: z.enum(['km', 'mi']).optional(),
  speed_unit: z.enum(['kmh', 'mph']).optional(),
  date_format: z.string().max(20).optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export const UpdatePrivacySchema = z.object({
  profile_visibility: z.enum(['public', 'riders_only', 'private']).optional(),
  ride_history_visibility: z.enum(['public', 'riders_only', 'private']).optional(),
  leaderboard_opt_in: z.boolean().optional(),
  invite_permission: z.enum(['everyone', 'followers_only', 'no_one']).optional(),
});
export type UpdatePrivacyInput = z.infer<typeof UpdatePrivacySchema>;

export const UpdateNotificationPrefSchema = z.object({
  notification_type: z.string().min(1).max(50),
  push_enabled: z.boolean().optional(),
  in_app_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
});
export type UpdateNotificationPrefInput = z.infer<typeof UpdateNotificationPrefSchema>;
