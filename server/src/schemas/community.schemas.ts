import { z } from 'zod/v4';

// --- Posts ---
export const CreatePostSchema = z.object({
  content: z.string().min(1).max(5000),
  media_urls: z.array(z.string().url()).max(10).optional(),
  shared_route_id: z.string().uuid().optional(),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

// --- Comments ---
export const CreateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  mentions: z.array(z.string().uuid()).optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

// --- Groups ---
export const CreateGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private']).default('public'),
});
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

// --- Ride Reviews ---
export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review_text: z.string().max(2000).optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
