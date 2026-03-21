import { query } from '../config/db.js';
import type { UpdateRiderInput } from '../schemas/rider.schemas.js';

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
  display_name: string;
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
  created_at: string;
  updated_at: string;
}

// Columns to SELECT for a full profile (never include password_hash)
const PROFILE_COLUMNS = `
  id, email, display_name, bio, profile_picture_url,
  experience_level, location_city, location_region,
  phone_number, weight_kg, total_rides, total_distance_km,
  total_ride_time_sec, created_at, updated_at
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
    [id]
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
  fields: UpdateRiderInput
): Promise<RiderProfile | null> => {
  const keys = Object.keys(fields).filter(
    (key) => fields[key as keyof UpdateRiderInput] !== undefined
  );

  if (keys.length === 0) {
    // Nothing to update — return current profile
    return getById(id);
  }

  // Build dynamic SET clause: "display_name = $1, bio = $2, ..."
  const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
  const values = keys.map((key) => fields[key as keyof UpdateRiderInput]);

  // The rider ID is the last parameter
  const idParamIndex = keys.length + 1;

  const result = await query(
    `UPDATE riders
     SET ${setClauses.join(', ')}
     WHERE id = $${idParamIndex} AND deleted_at IS NULL
     RETURNING ${PROFILE_COLUMNS}`,
    [...values, id]
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
    [id]
  );

  return (result.rowCount ?? 0) > 0;
};
