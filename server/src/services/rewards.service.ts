import { query } from "../config/db.js";
import type {
  CreateBadgeInput,
  CreateAchievementInput,
} from "../schemas/rewards.schemas.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BADGES (data-driven — new badges added without deploys)
// ═══════════════════════════════════════════════════════════════════════════════

export const createBadge = async (data: CreateBadgeInput) => {
  const result = await query(
    `INSERT INTO badges (name, description, icon_url, criteria_type, criteria_value)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      data.name,
      data.description || null,
      data.icon_url || null,
      data.criteria_type,
      data.criteria_value,
    ],
  );
  return result.rows[0];
};

export const listBadges = async () => {
  const result = await query(`SELECT * FROM badges ORDER BY created_at ASC`);
  return result.rows;
};

export const awardBadge = async (riderId: string, badgeId: string) => {
  const result = await query(
    `INSERT INTO rider_badges (rider_id, badge_id) VALUES ($1, $2)
     ON CONFLICT (rider_id, badge_id) DO NOTHING RETURNING *`,
    [riderId, badgeId],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

export const getRiderBadges = async (riderId: string) => {
  const result = await query(
    `SELECT b.*, rb.awarded_at
     FROM rider_badges rb JOIN badges b ON rb.badge_id = b.id
     WHERE rb.rider_id = $1
     ORDER BY rb.awarded_at DESC`,
    [riderId],
  );
  return result.rows;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS (tiered milestones)
// ═══════════════════════════════════════════════════════════════════════════════

export const createAchievement = async (data: CreateAchievementInput) => {
  const result = await query(
    `INSERT INTO achievements (name, tier, threshold, criteria_type, reward_description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      data.name,
      data.tier,
      data.threshold,
      data.criteria_type,
      data.reward_description || null,
    ],
  );
  return result.rows[0];
};

export const listAchievements = async () => {
  const result = await query(
    `SELECT * FROM achievements ORDER BY name, tier ASC`,
  );
  return result.rows;
};

export const getRiderAchievements = async (riderId: string) => {
  const result = await query(
    `SELECT a.name, a.tier, a.threshold, a.criteria_type, a.reward_description,
            ra.current_value, ra.current_tier, ra.updated_at
     FROM rider_achievements ra JOIN achievements a ON ra.achievement_id = a.id
     WHERE ra.rider_id = $1
     ORDER BY a.name, a.tier ASC`,
    [riderId],
  );
  return result.rows;
};

export const updateRiderAchievementProgress = async (
  riderId: string,
  achievementId: string,
  currentValue: number,
  currentTier: number,
) => {
  const result = await query(
    `INSERT INTO rider_achievements (rider_id, achievement_id, current_value, current_tier)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (rider_id, achievement_id) DO UPDATE
     SET current_value = $3, current_tier = $4
     RETURNING *`,
    [riderId, achievementId, currentValue, currentTier],
  );
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD (pre-aggregated from ride_history_stats)
// ═══════════════════════════════════════════════════════════════════════════════

export const getLeaderboard = async (
  metric:
    | "total_distance_km"
    | "total_rides"
    | "badges_earned" = "total_distance_km",
  limit = 20,
) => {
  let sql: string;

  if (metric === "badges_earned") {
    sql = `SELECT r.id, r.display_name, r.experience_level,
                  COUNT(rb.id)::int AS badges_earned
           FROM riders r
           LEFT JOIN rider_badges rb ON r.id = rb.rider_id
           WHERE r.deleted_at IS NULL
           GROUP BY r.id
           ORDER BY badges_earned DESC
           LIMIT $1`;
  } else if (metric === "total_rides") {
    sql = `SELECT r.id, r.display_name, r.experience_level,
          COALESCE(COUNT(rhs.id), 0)::int AS total_rides
           FROM riders r
        LEFT JOIN ride_history_stats rhs ON r.id = rhs.rider_id
           WHERE r.deleted_at IS NULL
           GROUP BY r.id
           ORDER BY total_rides DESC
           LIMIT $1`;
  } else {
    // total_distance_km from ride_history_stats
    sql = `SELECT r.id, r.display_name, r.experience_level,
                  COALESCE(SUM(rhs.total_distance_km), 0)::numeric AS total_distance_km
           FROM riders r
           LEFT JOIN ride_history_stats rhs ON r.id = rhs.rider_id
           WHERE r.deleted_at IS NULL
           GROUP BY r.id
           ORDER BY total_distance_km DESC
           LIMIT $1`;
  }

  const result = await query(sql, [limit]);
  return result.rows;
};
