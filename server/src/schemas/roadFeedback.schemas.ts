import { z } from 'zod';

/** What was different about the road. Same values as the table's check constraint. */
export const ROAD_FEEDBACK_REASONS = [
  'rough_surface',
  'heavy_traffic',
  'road_works',
  'not_scenic',
  'poorly_lit',
  'harder_than_described',
] as const;

export type RoadFeedbackReason = (typeof ROAD_FEEDBACK_REASONS)[number];

/** A line or two, like a route stop's note. */
export const MAX_ROAD_FEEDBACK_NOTE_LENGTH = 280;

/** A rider's answer to "Was the road as described?" */
export const RoadFeedbackSchema = z
  .object({
    as_described: z.boolean(),
    reasons: z
      .array(z.enum(ROAD_FEEDBACK_REASONS))
      .max(ROAD_FEEDBACK_REASONS.length)
      .refine((reasons) => new Set(reasons).size === reasons.length, 'Each reason once')
      .default([]),
    note: z
      .string()
      .trim()
      .max(MAX_ROAD_FEEDBACK_NOTE_LENGTH)
      .nullish()
      .transform((note) => (note ? note : null)),
  })
  .refine((feedback) => !feedback.as_described || feedback.reasons.length === 0, {
    message: 'Reasons are only for a road that was not as described',
    path: ['reasons'],
  });

export type RoadFeedbackInput = z.infer<typeof RoadFeedbackSchema>;
