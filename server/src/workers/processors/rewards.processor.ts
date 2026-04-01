/**
 * Rewards Recompute Processor
 *
 * Handles `rewards.recompute` jobs. For the given rider:
 *  1. Reads current aggregate totals from ride_history_stats.
 *  2. Awards badges whose criteria_type/criteria_value threshold the rider meets.
 *  3. Updates achievement progress tiers for all matching achievement definitions.
 *
 * Criteria types understood:
 *   - total_distance_km  → SUM of ride_history_stats.total_distance_km
 *   - total_rides        → COUNT of ride_history_stats rows
 *   - total_time_sec     → SUM of ride_history_stats.total_time_sec
 */

import { query } from "../../config/db.js";

interface RiderTotals {
  total_distance_km: number;
  total_rides: number;
  total_time_sec: number;
}

const getRiderTotals = async (riderId: string): Promise<RiderTotals> => {
  const result = await query(
    `SELECT
       COALESCE(SUM(total_distance_km), 0)::float AS total_distance_km,
       COUNT(*)::int AS total_rides,
       COALESCE(SUM(total_time_sec), 0)::bigint AS total_time_sec
     FROM ride_history_stats
     WHERE rider_id = $1`,
    [riderId],
  );
  const row = result.rows[0];
  return {
    total_distance_km: Number(row?.total_distance_km ?? 0),
    total_rides: Number(row?.total_rides ?? 0),
    total_time_sec: Number(row?.total_time_sec ?? 0),
  };
};

const getMetricValue = (
  totals: RiderTotals,
  criteriaType: string,
): number | null => {
  if (criteriaType === "total_distance_km") return totals.total_distance_km;
  if (criteriaType === "total_rides") return totals.total_rides;
  if (criteriaType === "total_time_sec") return totals.total_time_sec;
  return null;
};

const processRewardsForRider = async (
  riderId: string,
): Promise<{ badgesAwarded: number; achievementsUpdated: number }> => {
  const totals = await getRiderTotals(riderId);

  // ── Badge awards ─────────────────────────────────────────────────────────────
  const badgesResult = await query(
    `SELECT id, criteria_type, criteria_value
     FROM badges
     ORDER BY criteria_value ASC`,
  );

  let badgesAwarded = 0;

  for (const badge of badgesResult.rows) {
    const metricValue = getMetricValue(totals, badge.criteria_type as string);
    if (metricValue === null) continue;

    if (metricValue >= Number(badge.criteria_value)) {
      const insert = await query(
        `INSERT INTO rider_badges (rider_id, badge_id)
         VALUES ($1, $2)
         ON CONFLICT (rider_id, badge_id) DO NOTHING
         RETURNING id`,
        [riderId, badge.id],
      );
      if ((insert.rowCount ?? 0) > 0) {
        badgesAwarded++;
      }
    }
  }

  // ── Achievement progress ──────────────────────────────────────────────────────
  const achievementsResult = await query(
    `SELECT id, criteria_type, threshold, tier
     FROM achievements
     ORDER BY criteria_type, tier ASC`,
  );

  // Group by criteria_type to find highest earned tier per metric
  const achievementsByType = new Map<
    string,
    Array<{ id: string; threshold: number; tier: number }>
  >();
  for (const a of achievementsResult.rows) {
    const key = a.criteria_type as string;
    if (!achievementsByType.has(key)) achievementsByType.set(key, []);
    achievementsByType.get(key)!.push({
      id: a.id as string,
      threshold: Number(a.threshold),
      tier: Number(a.tier),
    });
  }

  let achievementsUpdated = 0;

  for (const [criteriaType, tiers] of achievementsByType.entries()) {
    const metricValue = getMetricValue(totals, criteriaType);
    if (metricValue === null) continue;

    const earnedTiers = tiers.filter((t) => metricValue >= t.threshold);
    const highestTier = earnedTiers.length > 0
      ? earnedTiers.reduce((best, t) => (t.tier > best.tier ? t : best))
      : null;

    for (const tier of tiers) {
      const currentTier = highestTier ? highestTier.tier : 0;
      const upsert = await query(
        `INSERT INTO rider_achievements (rider_id, achievement_id, current_value, current_tier)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (rider_id, achievement_id) DO UPDATE
         SET current_value = EXCLUDED.current_value,
             current_tier  = EXCLUDED.current_tier
         WHERE rider_achievements.current_value < EXCLUDED.current_value
            OR rider_achievements.current_tier  < EXCLUDED.current_tier
         RETURNING id`,
        [riderId, tier.id, metricValue, currentTier],
      );
      if ((upsert.rowCount ?? 0) > 0) {
        achievementsUpdated++;
      }
    }
  }

  return { badgesAwarded, achievementsUpdated };
};

export const processRewardsRecompute = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const riderId =
    typeof payload.riderId === "string" && payload.riderId.length > 0
      ? payload.riderId
      : null;

  if (!riderId) {
    throw new Error("riderId is required for rewards.recompute job");
  }

  const outcome = await processRewardsForRider(riderId);

  return {
    processor: "rewards-recompute",
    riderId,
    ...outcome,
    handledAt: new Date().toISOString(),
  };
};
