import { query } from "../config/db.js";
import type { UpdateRiderInput } from "../schemas/rider.schemas.js";

/**
 * RiderService — Profile management business logic.
 *
 * Learning Notes:
 * - getById: Simple SELECT with soft-delete filter.
 * - update: Builds a dynamic SQL SET clause from only the provided fields.
 *   This is a common pattern for PATCH endpoints in raw SQL — it's more
 *   complex than an ORM but teaches you exactly what's happening.
 * - softDelete: Sets deleted_at instead of removing the row. The 30-day
 *   grace period is enforced by a scheduled job (not yet implemented).
 */

/**
 * Full rider profile shape (everything except password_hash).
 */
export interface RiderProfile {
  id: string;
  email: string;
  is_admin: boolean;
  display_name: string;
  username: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  experience_level: string;
  location_city: string | null;
  location_region: string | null;
  phone_number: string | null;
  weight_kg: number | null;
  total_rides: number;
  total_distance_km: number;
  total_ride_time_sec: number;
  follower_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
  location_coords?: {
    type: string;
    coordinates: [number, number];
  };
}

// Columns to SELECT for a full profile (never include password_hash)
const PROFILE_COLUMNS = `
  id,
  email,
  COALESCE((to_jsonb(riders)->>'is_admin')::boolean, false) AS is_admin,
  display_name,
  username,
  bio,
  profile_picture_url,
  experience_level, location_city, location_region,
  phone_number, weight_kg, total_rides, total_distance_km,
  total_ride_time_sec, created_at, updated_at,
  ST_AsGeoJSON(location_coords)::json AS location_coords,
  (SELECT COUNT(*) FROM follows WHERE following_id = riders.id)::int AS follower_count,
  (SELECT COUNT(*) FROM follows WHERE follower_id = riders.id)::int AS following_count
`;

/**
 * Get a rider's full profile by ID.
 * Returns null if rider is not found or has been soft-deleted.
 */
export const getById = async (id: string): Promise<RiderProfile | null> => {
  const result = await query(
    `SELECT ${PROFILE_COLUMNS}
     FROM riders
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as RiderProfile;
};

/**
 * Update a rider's profile with only the provided fields.
 *
 * Learning Note (Dynamic SQL):
 * We build the SET clause dynamically so that only the fields present
 * in the input are updated. For example, if only { bio: "Hello" } is
 * passed, the SQL becomes: UPDATE riders SET bio = $1 WHERE id = $2
 *
 * This prevents overwriting existing values with NULL and is the
 * standard approach for PATCH operations with raw SQL.
 */
export const update = async (
  id: string,
  fields: UpdateRiderInput,
): Promise<RiderProfile | null> => {
  const keys = Object.keys(fields).filter(
    (key) => fields[key as keyof UpdateRiderInput] !== undefined,
  );

  if (keys.length === 0) {
    // Nothing to update — return current profile
    return getById(id);
  }

  // Build dynamic SET clause: "display_name = $1, bio = $2, ..."
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const key of keys) {
    if (key === "location_coords") {
      if (fields.location_coords === null) {
        setClauses.push(`location_coords = NULL`);
      } else {
        const coords = fields.location_coords as [number, number];
        setClauses.push(
          `location_coords = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`,
        );
        values.push(coords[0], coords[1]);
        paramIndex += 2;
      }
    } else {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(fields[key as keyof UpdateRiderInput]);
      paramIndex += 1;
    }
  }

  // The rider ID is the last parameter
  const idParamIndex = paramIndex;

  const result = await query(
    `UPDATE riders
     SET ${setClauses.join(", ")}
     WHERE id = $${idParamIndex} AND deleted_at IS NULL
     RETURNING ${PROFILE_COLUMNS}`,
    [...values, id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as RiderProfile;
};

/**
 * Soft-delete a rider's account.
 * Sets deleted_at to now() — the account can be recovered within 30 days.
 */
export const softDelete = async (id: string): Promise<boolean> => {
  const result = await query(
    `UPDATE riders
     SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
};
