import pool, { query } from '../config/db.js';
import type { CreateRideInput, UpdateRideInput } from '../schemas/ride.schemas.js';

export interface Ride {
  id: string;
  captain_id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  scheduled_at: string;
  estimated_duration_min: number | null;
  max_capacity: number | null;
  current_rider_count: number;
  requirements: any;
  created_at: string;
  updated_at: string;
  // Included from JOIN
  captain_name?: string;
}

const RIDE_COLUMNS = `
  id, captain_id, title, description, status, visibility,
  scheduled_at, estimated_duration_min, max_capacity,
  current_rider_count, requirements, created_at, updated_at
`;

/**
 * Creates a ride AND adds the captain as a participant in a single transaction.
 */
export const createRide = async (
  captainId: string,
  data: CreateRideInput
): Promise<Ride | null> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Build dynamic column/value lists for optional PostGIS fields
    const columns = [
      'captain_id', 'title', 'description', 'visibility', 'scheduled_at',
      'estimated_duration_min', 'max_capacity', 'requirements', 'current_rider_count'
    ];
    const values: any[] = [
      captainId,
      data.title,
      data.description || null,
      data.visibility,
      data.scheduled_at,
      data.estimated_duration_min || null,
      data.max_capacity || null,
      data.requirements ? JSON.stringify(data.requirements) : null,
      1, // current_rider_count starts at 1 (the captain)
    ];

    let paramIndex = values.length; // currently 9

    // Optionally add start_point
    if (data.start_point_coords) {
      paramIndex++;
      columns.push('start_point');
      values.push(`SRID=4326;POINT(${data.start_point_coords[0]} ${data.start_point_coords[1]})`);
    }

    // Optionally add end_point
    if (data.end_point_coords) {
      paramIndex++;
      columns.push('end_point');
      values.push(`SRID=4326;POINT(${data.end_point_coords[0]} ${data.end_point_coords[1]})`);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`);

    const insertRideQuery = `
      INSERT INTO rides (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING ${RIDE_COLUMNS}
    `;

    const rideResult = await client.query(insertRideQuery, values);
    const newRide = rideResult.rows[0];

    // 2. Insert the captain as a participant
    await client.query(
      `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
       VALUES ($1, $2, 'captain', 'confirmed', now())`,
      [newRide.id, captainId]
    );

    await client.query('COMMIT');
    return newRide as Ride;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createRide DB error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Gets ride details with captain's name.
 */
export const getRideById = async (id: string): Promise<Ride | null> => {
  const result = await query(
    `SELECT r.*,
            c.display_name as captain_name,
            ST_AsGeoJSON(r.start_point)::json AS start_point_geojson,
            ST_AsGeoJSON(r.end_point)::json AS end_point_geojson,
            (
              SELECT json_agg(
                json_build_object(
                  'rider_id', rp.rider_id, 
                  'joined_at', rp.joined_at, 
                  'role', rp.role, 
                  'display_name', u.display_name
                )
              )
              FROM ride_participants rp
              JOIN riders u ON rp.rider_id = u.id
              WHERE rp.ride_id = r.id
            ) as participants
     FROM rides r
     JOIN riders c ON r.captain_id = c.id
     WHERE r.id = $1`,
    [id]
  );
  return result.rows.length ? (result.rows[0] as Ride) : null;
};

/**
 * Lists public and upcoming rides.
 */
export const listDiscoverableRides = async (): Promise<Ride[]> => {
  const result = await query(
    `SELECT r.*, c.display_name as captain_name
     FROM rides r
     JOIN riders c ON r.captain_id = c.id
     WHERE r.visibility = 'public' 
       AND r.status IN ('draft', 'scheduled')
     ORDER BY r.scheduled_at ASC
     LIMIT 50`
  );
  return result.rows as Ride[];
};

/**
 * Allows the captain to update the ride info.
 */
export const updateRideInfo = async (
  rideId: string,
  captainId: string,
  fields: UpdateRideInput
): Promise<Ride | null> => {
  const keys = Object.keys(fields).filter(
    (key) => fields[key as keyof UpdateRideInput] !== undefined &&
             !key.endsWith('_coords') // Don't handle postgis updates trivially here for now
  );

  if (keys.length === 0) return getRideById(rideId);

  const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
  const values = keys.map((key) => fields[key as keyof UpdateRideInput]);

  const result = await query(
    `UPDATE rides
     SET ${setClauses.join(', ')}
     WHERE id = $${keys.length + 1} AND captain_id = $${keys.length + 2}
     RETURNING *`,
    [...values, rideId, captainId]
  );

  return result.rows.length ? (result.rows[0] as Ride) : null;
};

/**
 * Allows a rider to join a public ride.
 */
export const joinRide = async (rideId: string, riderId: string): Promise<boolean> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Try to insert the participant
    const insertResult = await client.query(
      `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
       VALUES ($1, $2, 'rider', 'confirmed', now())
       ON CONFLICT (ride_id, rider_id) DO NOTHING
       RETURNING id`,
      [rideId, riderId]
    );

    if (insertResult.rows.length > 0) {
      // If successfully joined, increment the counter
      await client.query(
        `UPDATE rides SET current_rider_count = current_rider_count + 1 WHERE id = $1`,
        [rideId]
      );
      await client.query('COMMIT');
      return true;
    } else {
      // Already a participant
      await client.query('ROLLBACK');
      return false;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
