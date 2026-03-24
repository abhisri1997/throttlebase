import { query } from "../config/db.js";
import type {
  CreatePostInput,
  CreateCommentInput,
  CreateGroupInput,
  CreateReviewInput,
} from "../schemas/community.schemas.js";

// ═══════════════════════════════════════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════════════════════════════════════

export const createPost = async (riderId: string, data: CreatePostInput) => {
  const result = await query(
    `INSERT INTO posts (rider_id, content, media_urls, shared_route_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      riderId,
      data.content,
      data.media_urls || null,
      data.shared_route_id || null,
    ],
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
    [limit, offset],
  );
  return result.rows;
};

export const getPostById = async (postId: string) => {
  const result = await query(
    `SELECT p.*, r.display_name AS author_name
     FROM posts p JOIN riders r ON p.rider_id = r.id
     WHERE p.id = $1`,
    [postId],
  );
  return result.rows[0] || null;
};

export const updatePost = async (
  postId: string,
  riderId: string,
  content: string,
) => {
  const result = await query(
    `UPDATE posts SET content = $1 WHERE id = $2 AND rider_id = $3 RETURNING *`,
    [content, postId, riderId],
  );
  return result.rows[0] || null;
};

export const deletePost = async (postId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM posts WHERE id = $1 AND rider_id = $2 RETURNING id`,
    [postId, riderId],
  );
  return result.rows.length > 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export const addComment = async (
  postId: string,
  riderId: string,
  data: CreateCommentInput,
) => {
  const result = await query(
    `INSERT INTO comments (post_id, rider_id, content, mentions)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [postId, riderId, data.content, data.mentions || null],
  );
  // Increment denormalized counter
  await query(
    `UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`,
    [postId],
  );
  return result.rows[0];
};

export const getComments = async (postId: string) => {
  const result = await query(
    `SELECT c.*, r.display_name AS author_name
     FROM comments c JOIN riders r ON c.rider_id = r.id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId],
  );
  return result.rows;
};

export const updateComment = async (
  commentId: string,
  riderId: string,
  content: string,
) => {
  const result = await query(
    `UPDATE comments SET content = $1 WHERE id = $2 AND rider_id = $3 RETURNING *`,
    [content, commentId, riderId],
  );
  return result.rows[0] || null;
};

export const deleteComment = async (commentId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM comments WHERE id = $1 AND rider_id = $2 RETURNING post_id`,
    [commentId, riderId],
  );
  if (result.rows.length > 0) {
    const postId = result.rows[0].post_id;
    await query(
      `UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1`,
      [postId],
    );
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
    [postId, riderId],
  );
  if (result.rows.length > 0) {
    await query(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, [
      postId,
    ]);
    return true;
  }
  return false; // already liked
};

export const unlikePost = async (postId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM likes WHERE post_id = $1 AND rider_id = $2 RETURNING id`,
    [postId, riderId],
  );
  if (result.rows.length > 0) {
    await query(
      `UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`,
      [postId],
    );
    return true;
  }
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOWS
// ═══════════════════════════════════════════════════════════════════════════════

export const followRider = async (followerId: string, followingId: string) => {
  if (followerId === followingId) throw new Error("Cannot follow yourself");
  const result = await query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING follower_id`,
    [followerId, followingId],
  );
  return result.rows.length > 0;
};

export const unfollowRider = async (
  followerId: string,
  followingId: string,
) => {
  const result = await query(
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING follower_id`,
    [followerId, followingId],
  );
  return result.rows.length > 0;
};

export const getFollowers = async (riderId: string, viewerId?: string) => {
  const result = await query(
    `SELECT r.id, r.display_name, r.experience_level,
            EXISTS(
              SELECT 1
              FROM follows vf
              WHERE vf.follower_id = $2
                AND vf.following_id = r.id
            ) AS is_following
     FROM follows f JOIN riders r ON f.follower_id = r.id
     WHERE f.following_id = $1
     ORDER BY f.created_at DESC`,
    [riderId, viewerId ?? null],
  );
  return result.rows;
};

export const getFollowing = async (riderId: string, viewerId?: string) => {
  const result = await query(
    `SELECT r.id, r.display_name, r.experience_level,
            EXISTS(
              SELECT 1
              FROM follows vf
              WHERE vf.follower_id = $2
                AND vf.following_id = r.id
            ) AS is_following
     FROM follows f JOIN riders r ON f.following_id = r.id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [riderId, viewerId ?? null],
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
    [data.name, data.description || null, data.visibility, riderId],
  );
  const group = result.rows[0];
  // Creator auto-joins as admin
  await query(
    `INSERT INTO group_members (group_id, rider_id, role) VALUES ($1, $2, 'admin')`,
    [group.id, riderId],
  );
  const fullGroup = await getGroupById(group.id as string, riderId);
  return fullGroup ?? group;
};

export type GroupListScope = "all" | "public" | "joined";

const ensureCreatorAdminMembership = async (
  riderId: string,
  groupId?: string,
) => {
  const params: string[] = [riderId];
  let groupFilter = "";

  if (groupId) {
    params.push(groupId);
    groupFilter = "AND g.id = $2";
  }

  await query(
    `INSERT INTO group_members (group_id, rider_id, role)
     SELECT g.id, g.created_by, 'admin'
     FROM groups g
     LEFT JOIN group_members gm
       ON gm.group_id = g.id
      AND gm.rider_id = g.created_by
     WHERE g.created_by = $1
       ${groupFilter}
       AND gm.group_id IS NULL
     ON CONFLICT (group_id, rider_id) DO NOTHING`,
    params,
  );
};

export const listGroups = async (
  riderId: string,
  scope: GroupListScope = "all",
) => {
  await ensureCreatorAdminMembership(riderId);

  const whereClause =
    scope === "public"
      ? `g.visibility = 'public'`
      : scope === "joined"
        ? `(g.created_by = $1 OR EXISTS (
            SELECT 1
            FROM group_members gm
            WHERE gm.group_id = g.id AND gm.rider_id = $1
          ))`
        : `(g.visibility = 'public' OR g.created_by = $1 OR EXISTS (
            SELECT 1
            FROM group_members gm
            WHERE gm.group_id = g.id AND gm.rider_id = $1
          ))`;

  const result = await query(
    `SELECT g.*, r.display_name AS creator_name,
            (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
            (
              g.created_by = $1 OR EXISTS (
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = g.id AND gm.rider_id = $1
              )
            ) AS is_member,
            (
              CASE
                WHEN g.created_by = $1 THEN 'admin'
                ELSE (
                  SELECT gm.role
                  FROM group_members gm
                  WHERE gm.group_id = g.id AND gm.rider_id = $1
                  LIMIT 1
                )
              END
            ) AS current_user_role
     FROM groups g JOIN riders r ON g.created_by = r.id
     WHERE ${whereClause}
     ORDER BY g.created_at DESC LIMIT 50`,
    [riderId],
  );
  return result.rows;
};

export const getGroupById = async (groupId: string, riderId: string) => {
  await ensureCreatorAdminMembership(riderId, groupId);

  const result = await query(
    `SELECT g.*, r.display_name AS creator_name,
            (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
            (
              g.created_by = $2 OR EXISTS(
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = g.id AND gm.rider_id = $2
              )
            ) AS is_member,
            (
              CASE
                WHEN g.created_by = $2 THEN 'admin'
                ELSE (
                  SELECT gm.role
                  FROM group_members gm
                  WHERE gm.group_id = g.id AND gm.rider_id = $2
                  LIMIT 1
                )
              END
            ) AS current_user_role,
            (
              SELECT COALESCE(
                json_agg(
                  json_build_object(
                    'rider_id', gm.rider_id,
                    'display_name', m.display_name,
                    'role', gm.role,
                    'joined_at', gm.joined_at
                  )
                  ORDER BY gm.joined_at ASC
                ),
                '[]'::json
              )
              FROM group_members gm
              JOIN riders m ON gm.rider_id = m.id
              WHERE gm.group_id = g.id
            ) AS members
     FROM groups g
     JOIN riders r ON g.created_by = r.id
     WHERE g.id = $1
       AND (g.visibility = 'public' OR g.created_by = $2 OR EXISTS (
         SELECT 1
         FROM group_members gm
         WHERE gm.group_id = g.id AND gm.rider_id = $2
       ))`,
    [groupId, riderId],
  );

  return result.rows[0] || null;
};

export const joinGroup = async (groupId: string, riderId: string) => {
  const groupResult = await query(
    `SELECT g.id, g.visibility,
            EXISTS (
              SELECT 1
              FROM group_members gm
              WHERE gm.group_id = g.id AND gm.rider_id = $2
            ) AS is_member,
            (
              SELECT gm.role
              FROM group_members gm
              WHERE gm.group_id = g.id AND gm.rider_id = $2
              LIMIT 1
            ) AS current_user_role
     FROM groups g
     WHERE g.id = $1`,
    [groupId, riderId],
  );

  if (groupResult.rows.length === 0) {
    throw new Error("Group not found");
  }

  const group = groupResult.rows[0] as {
    visibility: "public" | "private";
    is_member: boolean;
    current_user_role: "admin" | "member" | null;
  };

  if (group.is_member) {
    return {
      is_member: true,
      role: group.current_user_role ?? "member",
      newly_joined: false,
    };
  }

  if (group.visibility === "private") {
    throw new Error("Cannot join private group");
  }

  const result = await query(
    `INSERT INTO group_members (group_id, rider_id, role) VALUES ($1, $2, 'member')
     RETURNING role`,
    [groupId, riderId],
  );

  return {
    is_member: true,
    role: (result.rows[0]?.role as "admin" | "member") ?? "member",
    newly_joined: true,
  };
};

export const leaveGroup = async (groupId: string, riderId: string) => {
  const result = await query(
    `DELETE FROM group_members WHERE group_id = $1 AND rider_id = $2 AND role != 'admin'
     RETURNING group_id`,
    [groupId, riderId],
  );
  return result.rows.length > 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDE REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

export const addRideReview = async (
  rideId: string,
  riderId: string,
  data: CreateReviewInput,
) => {
  const eligibility = await query(
    `SELECT r.status,
            (
              r.captain_id = $2 OR EXISTS (
                SELECT 1
                FROM ride_participants rp
                WHERE rp.ride_id = r.id
                  AND rp.rider_id = $2
                  AND rp.status = 'confirmed'
              )
            ) AS is_participant
     FROM rides r
     WHERE r.id = $1`,
    [rideId, riderId],
  );

  if (eligibility.rows.length === 0) {
    throw new Error("Ride not found");
  }

  const rideStatus = eligibility.rows[0].status as string;
  const isParticipant = Boolean(eligibility.rows[0].is_participant);

  if (rideStatus !== "completed") {
    throw new Error("Reviews are only allowed for completed rides");
  }

  if (!isParticipant) {
    throw new Error("Only ride participants can submit a review");
  }

  const result = await query(
    `INSERT INTO ride_reviews (ride_id, rider_id, rating, review_text)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [rideId, riderId, data.rating, data.review_text || null],
  );
  return result.rows[0];
};

export const getRideReviews = async (rideId: string) => {
  const result = await query(
    `SELECT rr.*, r.display_name AS reviewer_name
     FROM ride_reviews rr JOIN riders r ON rr.rider_id = r.id
     WHERE rr.ride_id = $1
     ORDER BY rr.created_at DESC`,
    [rideId],
  );
  return result.rows;
};
