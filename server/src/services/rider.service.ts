import { query } from "../config/db.js";
import type { UpdateRiderInput } from "../schemas/rider.schemas.js";
import { visibleToViewerSql } from "./blocks.js";

/**
 * RiderService — Profile management business logic.
 *
 * Learning Notes:
 * - getById: Simple SELECT with soft-delete filter.
 * - update: Builds a dynamic SQL SET clause from only the provided fields.
 *   This is a common pattern for PATCH endpoints in raw SQL — it's more
 *   complex than an ORM but teaches you exactly what's happening.
 */

/**
 * Full rider profile shape (everything except password_hash).
 */
export interface RiderProfile {
  id: string;
  email: string;
  /** From rider_roles ('admin', 'support'); empty for most riders. Never public. */
  roles: string[];
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

export interface VehicleProfile {
  id: string;
  rider_id: string;
  make: string;
  model: string;
  year: number;
  engine_capacity_cc: number | null;
}


export interface MentionSuggestion {
  id: string;
  username: string;
  display_name: string;
  is_following: boolean;
}

// Columns to SELECT for a full profile (never include password_hash)
const PROFILE_COLUMNS = `
  id,
  email,
  ARRAY(SELECT rr.role FROM rider_roles rr WHERE rr.rider_id = riders.id ORDER BY rr.role) AS roles,
  display_name,
  username,
  bio,
  profile_picture_url,
  experience_level, location_city, location_region,
  phone_number, weight_kg, total_rides, total_distance_km,
  total_ride_time_sec, created_at, updated_at,
  ST_AsGeoJSON(location_coords)::json AS location_coords,
  (SELECT COUNT(*) FROM follows f JOIN riders fr ON fr.id = f.follower_id
    WHERE f.following_id = riders.id AND fr.deleted_at IS NULL)::int AS follower_count,
  (SELECT COUNT(*) FROM follows f JOIN riders fr ON fr.id = f.following_id
    WHERE f.follower_id = riders.id AND fr.deleted_at IS NULL)::int AS following_count
`;

const VEHICLE_COLUMNS = `
  id,
  rider_id,
  make,
  model,
  year,
  engine_capacity_cc
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

export const getRiderVehicles = async (riderId: string): Promise<VehicleProfile[]> => {
  const result = await query(
    `SELECT ${VEHICLE_COLUMNS}
     FROM vehicles
     WHERE rider_id = $1`,
    [riderId],
  );

  if (result.rows.length === 0) {
    return [];
  }

  return result.rows as VehicleProfile[];
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

export const searchMentionSuggestions = async (
  viewerId: string,
  prefix: string,
  limit = 8,
): Promise<MentionSuggestion[]> => {
  const normalizedPrefix = prefix.trim().toLowerCase();
  if (!normalizedPrefix || !/^[a-z0-9_]+$/.test(normalizedPrefix)) {
    return [];
  }

  const result = await query(
    `SELECT
        r.id,
        r.username,
        r.display_name,
        EXISTS(
          SELECT 1
          FROM follows f
          WHERE f.follower_id = $1
            AND f.following_id = r.id
        ) AS is_following
     FROM riders r
     WHERE r.deleted_at IS NULL
       AND r.id != $1
       AND r.username IS NOT NULL
       AND LOWER(r.username) LIKE $2
       AND ${visibleToViewerSql("$1::uuid", "r.id")}
     ORDER BY is_following DESC,
              CASE WHEN LOWER(r.username) = $3 THEN 0 ELSE 1 END,
              LOWER(r.username) ASC
     LIMIT $4`,
    [viewerId, `${normalizedPrefix}%`, normalizedPrefix, limit],
  );

  return result.rows as MentionSuggestion[];
};
