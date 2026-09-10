import { z } from 'zod';

/**
 * Google publishes no maximum polyline length for search-along-route, so this
 * cap is ours: it bounds request size rather than mirroring a documented limit.
 * A simplified overview polyline for a long ride sits well under it.
 */
export const MAX_ENCODED_POLYLINE_LENGTH = 20000;

export const MAX_SUGGESTION_LIMIT = 20;
const DEFAULT_SUGGESTION_LIMIT = 10;

const LngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const StopSuggestionQuerySchema = z.object({
  category: z.enum(['fuel', 'rest', 'photo']),
  encodedPolyline: z.string().min(1).max(MAX_ENCODED_POLYLINE_LENGTH),
  mode: z.enum(['planning', 'live']).default('planning'),
  /** Live mode only: quantized into the cache key so a moving rider reuses results. */
  origin: LngLatSchema.optional(),
  openNow: z.boolean().optional(),
  limit: z.number().int().positive().max(MAX_SUGGESTION_LIMIT).default(DEFAULT_SUGGESTION_LIMIT),
});

export type StopSuggestionQueryInput = z.infer<typeof StopSuggestionQuerySchema>;
