import { query } from '../config/db.js';
import type {
  CreatePostInput,
  CreateCommentInput,
  CreateGroupInput,
  CreateReviewInput,
} from '../schemas/community.schemas.js';

// ═══════════════════════════════════════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════════════════════════════════════

export const createPost = async (riderId: string, data: CreatePostInput) => {
  const result = await query(
    `INSERT INTO posts (rider_id, content, media_urls, shared_route_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [riderId, data.content, data.media_urls || null, data.shared_route_id || null]
  );
  return result.rows[0];
};

export const getFeed = async (limit = 50, offset = 0) => {
  const result = await query(
    `SELECT p.*, r.display_name AS author_name
     FROM posts p
     JOIN riders r ON p.rider_id = r.id
     ORDER BY p.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
};

export const getPostById = async (postId: string) => {
  const result = await query(
    `SELECT p.*, r.display_name AS author_name
     FROM posts p JOIN riders r ON p.rider_id = r.id
     WHERE p.id = $1`,
    [postId]
  );
  return result.rows[0] || null;
};

export const updatePost = async (postId: string, riderId: string, content: string) => {
  const result = await query(
    `UPDATE posts SET content = $1 WHERE id = $2 AND rider_id = $3 RETURNING *`,
    [content, postId, riderId]
  );
  return result.rows[0] || null;
};

export const deletePost = async (postId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM posts WHERE id = $1 AND rider_id = $2 RETURNING id`,
    [postId, riderId]
  );
  return result.rows.length > 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export const addComment = async (
  postId: string, riderId: string, data: CreateCommentInput
) => {
  const result = await query(
    `INSERT INTO comments (post_id, rider_id, content, mentions)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [postId, riderId, data.content, data.mentions || null]
  );
  // Increment denormalized counter
  await query(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, [postId]);
  return result.rows[0];
};

export const getComments = async (postId: string) => {
  const result = await query(
    `SELECT c.*, r.display_name AS author_name
     FROM comments c JOIN riders r ON c.rider_id = r.id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId]
  );
  return result.rows;
};

export const updateComment = async (commentId: string, riderId: string, content: string) => {
  const result = await query(
    `UPDATE comments SET content = $1 WHERE id = $2 AND rider_id = $3 RETURNING *`,
    [content, commentId, riderId]
  );
  return result.rows[0] || null;
};

export const deleteComment = async (commentId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM comments WHERE id = $1 AND rider_id = $2 RETURNING post_id`,
    [commentId, riderId]
  );
  if (result.rows.length > 0) {
    const postId = result.rows[0].post_id;
    await query(`UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1`, [postId]);
    return true;
  }
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIKES
// ═══════════════════════════════════════════════════════════════════════════════

export const likePost = async (postId: string, riderId: string) => {
  const result = await query(
    `INSERT INTO likes (post_id, rider_id) VALUES ($1, $2)
     ON CONFLICT (post_id, rider_id) DO NOTHING RETURNING id`,
    [postId, riderId]
  );
  if (result.rows.length > 0) {
    await query(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, [postId]);
    return true;
  }
  return false; // already liked
};

export const unlikePost = async (postId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM likes WHERE post_id = $1 AND rider_id = $2 RETURNING id`,
    [postId, riderId]
  );
  if (result.rows.length > 0) {
    await query(`UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`, [postId]);
    return true;
  }
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOWS
// ═══════════════════════════════════════════════════════════════════════════════

export const followRider = async (followerId: string, followingId: string) => {
  if (followerId === followingId) throw new Error('Cannot follow yourself');
  const result = await query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING follower_id`,
    [followerId, followingId]
  );
  return result.rows.length > 0;
};

export const unfollowRider = async (followerId: string, followingId: string) => {
  const result = await query(
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING follower_id`,
    [followerId, followingId]
  );
  return result.rows.length > 0;
};

export const getFollowers = async (riderId: string) => {
  const result = await query(
    `SELECT r.id, r.display_name, r.experience_level
     FROM follows f JOIN riders r ON f.follower_id = r.id
     WHERE f.following_id = $1
     ORDER BY f.created_at DESC`,
    [riderId]
  );
  return result.rows;
};

export const getFollowing = async (riderId: string) => {
  const result = await query(
    `SELECT r.id, r.display_name, r.experience_level
     FROM follows f JOIN riders r ON f.following_id = r.id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [riderId]
  );
  return result.rows;
};

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPS
// ═══════════════════════════════════════════════════════════════════════════════

export const createGroup = async (riderId: string, data: CreateGroupInput) => {
  const result = await query(
    `INSERT INTO groups (name, description, visibility, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, data.description || null, data.visibility, riderId]
  );
  const group = result.rows[0];
  // Creator auto-joins as admin
  await query(
    `INSERT INTO group_members (group_id, rider_id, role) VALUES ($1, $2, 'admin')`,
    [group.id, riderId]
  );
  return group;
};

export const listGroups = async () => {
  const result = await query(
    `SELECT g.*, r.display_name AS creator_name,
            (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS member_count
     FROM groups g JOIN riders r ON g.created_by = r.id
     WHERE g.visibility = 'public'
     ORDER BY g.created_at DESC LIMIT 50`
  );
  return result.rows;
};

export const joinGroup = async (groupId: string, riderId: string) => {
  const result = await query(
    `INSERT INTO group_members (group_id, rider_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING group_id`,
    [groupId, riderId]
  );
  return result.rows.length > 0;
};

export const leaveGroup = async (groupId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM group_members WHERE group_id = $1 AND rider_id = $2 AND role != 'admin'
     RETURNING group_id`,
    [groupId, riderId]
  );
  return result.rows.length > 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDE REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

export const addRideReview = async (
  rideId: string, riderId: string, data: CreateReviewInput
) => {
  const result = await query(
    `INSERT INTO ride_reviews (ride_id, rider_id, rating, review_text)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [rideId, riderId, data.rating, data.review_text || null]
  );
  return result.rows[0];
};

export const getRideReviews = async (rideId: string) => {
  const result = await query(
    `SELECT rr.*, r.display_name AS reviewer_name
     FROM ride_reviews rr JOIN riders r ON rr.rider_id = r.id
     WHERE rr.ride_id = $1
     ORDER BY rr.created_at DESC`,
    [rideId]
  );
  return result.rows;
};
