/**
 * Account Purge Processor
 *
 * Handles `account.purge` jobs. Once a deleted account's grace period has
 * passed, it removes that rider's own data — and nothing that belongs to
 * anyone else (docs/launch-readiness/plans/account-deletion.md).
 *
 * The riders row is never deleted. It stays as an empty tombstone with
 * `purged_at` set, because shared records point at it: rides the rider
 * captained (rides.captain_id is ON DELETE RESTRICT), groups they created,
 * incidents, and stops they requested. Every personal field on it was
 * already cleared when the account was deleted; the purge clears them again
 * and zeroes the rider's totals.
 *
 * Each table is named explicitly rather than left to ON DELETE CASCADE, so a
 * new foreign key can never widen what a purge removes without a code change.
 * Deleting the rider's posts and routes still cascades to what hangs off them
 * (comments and likes on their posts, stops and bookmarks on their routes),
 * as deleting that content does in the app.
 *
 * Not yet handled here (later E1 slices): handing off upcoming rides and
 * groups the rider led, and the sealed 180-day registration record.
 *
 * One transaction per rider; safe to run repeatedly. The job result carries
 * counts only, never identifiers of what was removed.
 */

import type { PoolClient } from "pg";
import pool, { query } from "../../config/db.js";

/** Days between deleting an account and purging its data. */
export const ACCOUNT_PURGE_GRACE_DAYS = 30;

/** Riders purged per job run; the next run picks up the rest. */
const PURGE_BATCH_SIZE = 50;

/** The rider's own rows, in dependency order. `$1` is the rider id. */
const OWN_DATA_DELETES: ReadonlyArray<{ table: string; sql: string }> = [
  // Riding
  { table: "ride_live_location_samples", sql: "DELETE FROM ride_live_location_samples WHERE rider_id = $1" },
  { table: "ride_live_presence", sql: "DELETE FROM ride_live_presence WHERE rider_id = $1" },
  { table: "ride_history_stats", sql: "DELETE FROM ride_history_stats WHERE rider_id = $1" },
  { table: "ride_participants", sql: "DELETE FROM ride_participants WHERE rider_id = $1" },
  { table: "gps_traces", sql: "DELETE FROM gps_traces WHERE rider_id = $1" },
  { table: "ride_reviews", sql: "DELETE FROM ride_reviews WHERE rider_id = $1" },
  // Routes
  { table: "route_road_feedback", sql: "DELETE FROM route_road_feedback WHERE rider_id = $1" },
  { table: "route_bookmarks", sql: "DELETE FROM route_bookmarks WHERE rider_id = $1" },
  { table: "route_shares", sql: "DELETE FROM route_shares WHERE shared_with_rider_id = $1" },
  { table: "routes", sql: "DELETE FROM routes WHERE creator_id = $1" },
  // Community
  { table: "comments", sql: "DELETE FROM comments WHERE rider_id = $1" },
  { table: "likes", sql: "DELETE FROM likes WHERE rider_id = $1" },
  { table: "posts", sql: "DELETE FROM posts WHERE rider_id = $1" },
  { table: "follows", sql: "DELETE FROM follows WHERE follower_id = $1 OR following_id = $1" },
  { table: "blocked_riders", sql: "DELETE FROM blocked_riders WHERE blocker_id = $1 OR blocked_id = $1" },
  { table: "group_members", sql: "DELETE FROM group_members WHERE rider_id = $1" },
  // Account
  { table: "notifications", sql: "DELETE FROM notifications WHERE rider_id = $1" },
  { table: "notification_preferences", sql: "DELETE FROM notification_preferences WHERE rider_id = $1" },
  { table: "rider_settings", sql: "DELETE FROM rider_settings WHERE rider_id = $1" },
  { table: "rider_privacy_settings", sql: "DELETE FROM rider_privacy_settings WHERE rider_id = $1" },
  { table: "vehicles", sql: "DELETE FROM vehicles WHERE rider_id = $1" },
  { table: "gear", sql: "DELETE FROM gear WHERE rider_id = $1" },
  { table: "rider_badges", sql: "DELETE FROM rider_badges WHERE rider_id = $1" },
  { table: "rider_achievements", sql: "DELETE FROM rider_achievements WHERE rider_id = $1" },
  { table: "support_tickets", sql: "DELETE FROM support_tickets WHERE rider_id = $1" },
  { table: "login_activity", sql: "DELETE FROM login_activity WHERE rider_id = $1" },
  { table: "sessions", sql: "DELETE FROM sessions WHERE rider_id = $1" },
  { table: "rider_identities", sql: "DELETE FROM rider_identities WHERE rider_id = $1" },
  { table: "rider_roles", sql: "DELETE FROM rider_roles WHERE rider_id = $1" },
];

type RowCounts = Record<string, number>;

const findRidersDueForPurge = async (): Promise<string[]> => {
  const result = await query(
    `SELECT id
     FROM riders
     WHERE deleted_at IS NOT NULL
       AND purged_at IS NULL
       AND deleted_at < now() - ($1 || ' days')::interval
     ORDER BY deleted_at ASC
     LIMIT $2`,
    [String(ACCOUNT_PURGE_GRACE_DAYS), PURGE_BATCH_SIZE],
  );
  return result.rows.map((row) => row.id as string);
};

const purgeRider = async (client: PoolClient, riderId: string): Promise<RowCounts> => {
  const counts: RowCounts = {};

  for (const { table, sql } of OWN_DATA_DELETES) {
    const result = await client.query(sql, [riderId]);
    counts[table] = result.rowCount ?? 0;
  }

  // Proof of which Terms were accepted, and when, is kept; the IP address
  // that came with it is personal data and goes. ⚖️ retention of the
  // remaining evidence is for counsel to confirm (plans/consent.md).
  await client.query(`UPDATE rider_consents SET ip = NULL WHERE rider_id = $1`, [riderId]);

  await client.query(
    `UPDATE riders
        SET purged_at = now(),
            email = NULL,
            display_name = 'Deleted rider',
            username = NULL,
            bio = NULL,
            profile_picture_url = NULL,
            phone_number = NULL,
            location_city = NULL,
            location_region = NULL,
            location_coords = NULL,
            weight_kg = NULL,
            total_rides = 0,
            total_distance_km = 0,
            total_ride_time_sec = 0,
            updated_at = now()
      WHERE id = $1
        AND deleted_at IS NOT NULL
        AND purged_at IS NULL`,
    [riderId],
  );

  return counts;
};

const addCounts = (total: RowCounts, more: RowCounts): RowCounts =>
  Object.entries(more).reduce(
    (sum, [table, count]) => ({ ...sum, [table]: (sum[table] ?? 0) + count }),
    total,
  );

export const processAccountPurge = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const riderIds = await findRidersDueForPurge();
  let rowsDeleted: RowCounts = {};

  for (const riderId of riderIds) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const counts = await purgeRider(client, riderId);
      await client.query("COMMIT");
      rowsDeleted = addCounts(rowsDeleted, counts);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    processor: "account-purge",
    ridersPurged: riderIds.length,
    rowsDeleted,
    handledAt: new Date().toISOString(),
  };
};
