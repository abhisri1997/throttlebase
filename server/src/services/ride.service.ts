import pool, { query } from "../config/db.js";
import type {
  CreateRideInput,
  UpdateRideInput,
  RequestStopInput,
} from "../schemas/ride.schemas.js";
import { calculateGeometricMedian, snapToNearestPlace } from "../utils/geo.js";

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

export interface RideStop {
  id: string;
  ride_id: string;
  requested_by: string | null;
  approved_by: string | null;
  type: string;
  status: string;
  stopped_at: string | null;
  resumed_at: string | null;
  created_at: string;
  requester_name?: string;
  approver_name?: string;
}

const RIDE_COLUMNS = `
  id, captain_id, title, description, status, visibility,
  scheduled_at, estimated_duration_min, max_capacity,
  current_rider_count, requirements, created_at, updated_at
`;

// ----- Allowed state transitions -----
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * Creates a ride AND adds the captain as a participant in a single transaction.
 * Optionally inserts pre-planned stops.
 */
export const createRide = async (
  captainId: string,
  data: CreateRideInput,
): Promise<Ride | null> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Build dynamic column/value lists for optional PostGIS fields
    const columns = [
      "captain_id",
      "title",
      "description",
      "status",
      "visibility",
      "scheduled_at",
      "estimated_duration_min",
      "max_capacity",
      "requirements",
      "current_rider_count",
    ];
    const values: any[] = [
      captainId,
      data.title,
      data.description || null,
      data.status || "draft",
      data.visibility,
      data.scheduled_at,
      data.estimated_duration_min || null,
      data.max_capacity || null,
      data.requirements ? JSON.stringify(data.requirements) : null,
      1, // current_rider_count starts at 1 (the captain)
    ];

    let paramIndex = values.length;

    // Optionally add start_point
    if (data.start_point_coords) {
      paramIndex++;
      columns.push("start_point");
      values.push(
        `SRID=4326;POINT(${data.start_point_coords[0]} ${data.start_point_coords[1]})`,
      );
    }

    // Optionally add start_point_name
    if (data.start_point_name) {
      paramIndex++;
      columns.push("start_point_name");
      values.push(data.start_point_name);
    }

    // Optionally add end_point
    if (data.end_point_coords) {
      paramIndex++;
      columns.push("end_point");
      values.push(
        `SRID=4326;POINT(${data.end_point_coords[0]} ${data.end_point_coords[1]})`,
      );
    }

    // Optionally add end_point_name
    if (data.end_point_name) {
      paramIndex++;
      columns.push("end_point_name");
      values.push(data.end_point_name);
    }

    // Store auto-start flag
    if (data.start_point_auto) {
      paramIndex++;
      columns.push("start_point_auto");
      values.push(true);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`);

    const insertRideQuery = `
      INSERT INTO rides (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING ${RIDE_COLUMNS}
    `;

    const rideResult = await client.query(insertRideQuery, values);
    const newRide = rideResult.rows[0];

    // 2. Insert the captain as a participant
    await client.query(
      `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
       VALUES ($1, $2, 'captain', 'confirmed', now())`,
      [newRide.id, captainId],
    );

    // 3. Insert pre-planned stops if provided
    if (data.stops && data.stops.length > 0) {
      for (const stop of data.stops) {
        await client.query(
          `INSERT INTO ride_stops (ride_id, requested_by, approved_by, type, location, name, status, created_at)
           VALUES ($1, $2, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, 'approved', now())`,
          [
            newRide.id,
            captainId,
            stop.type,
            stop.location_coords[0],
            stop.location_coords[1],
            stop.name || null,
          ],
        );
      }
    }

    await client.query("COMMIT");
    return newRide as Ride;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("createRide DB error:", error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Gets ride details with captain's name, participants, and stops.
 */
export const getRideById = async (id: string): Promise<Ride | null> => {
  const result = await query(
    `SELECT r.*,
            c.display_name as captain_name,
            ST_AsGeoJSON(r.start_point)::json AS start_point_geojson,
            ST_AsGeoJSON(r.end_point)::json AS end_point_geojson,
            r.start_point_name,
            r.end_point_name,
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
              WHERE rp.ride_id = r.id AND rp.status = 'confirmed'
            ) as participants,
            (
              SELECT json_agg(
                json_build_object(
                  'id', rs.id,
                  'type', rs.type,
                  'status', rs.status,
                  'requested_by', rs.requested_by,
                  'approved_by', rs.approved_by,
                  'requester_name', req.display_name,
                  'location', ST_AsGeoJSON(rs.location)::json,
                  'created_at', rs.created_at
                ) ORDER BY rs.created_at ASC
              )
              FROM ride_stops rs
              LEFT JOIN riders req ON rs.requested_by = req.id
              WHERE rs.ride_id = r.id
            ) as stops
     FROM rides r
     JOIN riders c ON r.captain_id = c.id
     WHERE r.id = $1`,
    [id],
  );
  return result.rows.length ? (result.rows[0] as Ride) : null;
};

/**
 * Lists public and upcoming rides.
 */
export const listDiscoverableRides = async (
  riderId?: string,
): Promise<Ride[]> => {
  let queryStr = `
    SELECT r.*, c.display_name as captain_name
    FROM rides r
    JOIN riders c ON r.captain_id = c.id
    WHERE r.status NOT IN ('completed', 'cancelled')
      AND (
        (r.visibility = 'public' AND r.status IN ('scheduled', 'active'))
  `;
  const params: any[] = [];

  if (riderId) {
    queryStr += ` OR r.captain_id = $1 OR EXISTS (SELECT 1 FROM ride_participants rp WHERE rp.ride_id = r.id AND rp.rider_id = $1)`;
    params.push(riderId);
  }

  queryStr += ` ) ORDER BY r.scheduled_at ASC LIMIT 50`;

  const result = await query(queryStr, params);
  return result.rows as Ride[];
};

/**
 * Gets a user's completed or cancelled rides.
 */
export const getRideHistory = async (riderId: string): Promise<Ride[]> => {
  const result = await query(
    `SELECT r.*, c.display_name as captain_name
     FROM rides r
     JOIN riders c ON r.captain_id = c.id
     WHERE r.status IN ('completed', 'cancelled')
       AND (r.captain_id = $1 OR EXISTS (
         SELECT 1 FROM ride_participants rp WHERE rp.ride_id = r.id AND rp.rider_id = $1
       ))
     ORDER BY r.scheduled_at DESC`,
    [riderId],
  );
  return result.rows as Ride[];
};

/**
 * Allows the captain (or co-captain) to update the ride info.
 * Enforces state machine transition guards.
 */
export const updateRideInfo = async (
  rideId: string,
  captainId: string,
  fields: UpdateRideInput,
): Promise<Ride | null> => {
  // Verify the caller is captain or co-captain
  const authCheck = await query(
    `SELECT r.status FROM rides r WHERE r.id = $1 AND (
      r.captain_id = $2 OR EXISTS (
        SELECT 1 FROM ride_participants WHERE ride_id = $1 AND rider_id = $2 AND role = 'co_captain'
      )
    )`,
    [rideId, captainId],
  );

  if (authCheck.rows.length === 0) return null;

  // Block all edits if the ride is already completed or cancelled
  const currentStatus = authCheck.rows[0].status;
  if (["completed", "cancelled"].includes(currentStatus)) {
    throw new Error(`Cannot edit a ride that is already ${currentStatus}`);
  }

  // If status change requested, validate transition
  if (fields.status) {
    const currentStatus = authCheck.rows[0].status;

    // Only validate if it's an actual state change
    if (fields.status !== currentStatus) {
      const allowed = VALID_TRANSITIONS[currentStatus] || [];

      if (!allowed.includes(fields.status)) {
        throw new Error(
          `Invalid status transition: ${currentStatus} → ${fields.status}. Allowed: ${allowed.join(", ") || "none"}`,
        );
      }
    }
  }

  // Build SET clauses dynamically
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 0;

  // Handle regular scalar fields
  const scalarFields = [
    "title",
    "description",
    "status",
    "visibility",
    "scheduled_at",
    "estimated_duration_min",
    "max_capacity",
    "start_point_name",
    "end_point_name",
    "start_point_auto",
  ] as const;

  for (const key of scalarFields) {
    if (fields[key as keyof UpdateRideInput] !== undefined) {
      paramIdx++;
      const val = fields[key as keyof UpdateRideInput];
      setClauses.push(`${key} = $${paramIdx}`);
      values.push(val);
    }
  }

  // Handle requirements (needs JSON serialization)
  if (fields.requirements !== undefined) {
    paramIdx++;
    setClauses.push(`requirements = $${paramIdx}`);
    values.push(JSON.stringify(fields.requirements));
  }

  // Handle spatial coordinates — convert to PostGIS points
  if (fields.start_point_coords) {
    paramIdx++;
    setClauses.push(
      `start_point = ST_SetSRID(ST_MakePoint($${paramIdx}, $${paramIdx + 1}), 4326)::geography`,
    );
    values.push(fields.start_point_coords[0], fields.start_point_coords[1]);
    paramIdx++;
  }

  if (fields.end_point_coords) {
    paramIdx++;
    setClauses.push(
      `end_point = ST_SetSRID(ST_MakePoint($${paramIdx}, $${paramIdx + 1}), 4326)::geography`,
    );
    values.push(fields.end_point_coords[0], fields.end_point_coords[1]);
    paramIdx++;
  }

  if (setClauses.length === 0) return getRideById(rideId);

  paramIdx++;
  const rideIdParam = paramIdx;
  values.push(rideId);

  const result = await query(
    `UPDATE rides SET ${setClauses.join(", ")} WHERE id = $${rideIdParam} RETURNING *`,
    values,
  );

  return result.rows.length ? (result.rows[0] as Ride) : null;
};

/**
 * Deletes a ride.
 * Only the captain can delete it, and only if it hasn't started yet (not active/completed).
 */
export const deleteRide = async (
  rideId: string,
  captainId: string,
): Promise<boolean> => {
  const result = await query(
    `DELETE FROM rides 
     WHERE id = $1 AND captain_id = $2 AND status NOT IN ('active', 'completed') 
     RETURNING id`,
    [rideId, captainId],
  );
  return result.rows.length > 0;
};

/**
 * Allows a rider to join a public ride.
 * Enforces max capacity using SELECT ... FOR UPDATE (optimistic locking).
 */
export const joinRide = async (
  rideId: string,
  riderId: string,
  overrideLocation?: [number, number],
): Promise<boolean> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the ride row and check capacity
    const rideResult = await client.query(
      `SELECT id, max_capacity, current_rider_count, status, visibility, start_point_auto
       FROM rides WHERE id = $1 FOR UPDATE`,
      [rideId],
    );

    if (rideResult.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("Ride not found");
    }

    const ride = rideResult.rows[0];

    // Only allow joining published (scheduled), active, or completed rides
    if (!["scheduled", "active", "completed"].includes(ride.status)) {
      await client.query("ROLLBACK");
      throw new Error(`Cannot join a ride with status "${ride.status}"`);
    }

    // Enforce max capacity
    if (ride.max_capacity && ride.current_rider_count >= ride.max_capacity) {
      await client.query("ROLLBACK");
      throw new Error("This ride has reached its maximum capacity");
    }

    // Try to insert the participant
    const insertQuery = overrideLocation
      ? `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at, start_location_override)
         VALUES ($1, $2, 'rider', 'confirmed', now(), ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
         ON CONFLICT (ride_id, rider_id) DO NOTHING
         RETURNING id`
      : `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
         VALUES ($1, $2, 'rider', 'confirmed', now())
         ON CONFLICT (ride_id, rider_id) DO NOTHING
         RETURNING id`;

    const insertParams = overrideLocation
      ? [rideId, riderId, overrideLocation[0], overrideLocation[1]]
      : [rideId, riderId];

    const insertResult = await client.query(insertQuery, insertParams);

    if (insertResult.rows.length > 0) {
      // If successfully joined, increment the counter
      await client.query(
        `UPDATE rides SET current_rider_count = current_rider_count + 1 WHERE id = $1`,
        [rideId],
      );
      await client.query("COMMIT");

      // Auto-calculate start point if enabled
      if (ride.start_point_auto) {
        recalculateStartPoint(rideId).catch((err) =>
          console.error(
            `Failed to recalculate start point for ride ${rideId}:`,
            err,
          ),
        );
      }

      return true;
    } else {
      // Already a participant
      await client.query("ROLLBACK");
      return false;
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Promote a rider to co-captain. Only the original captain can do this.
 */
export const promoteToCoCaptain = async (
  rideId: string,
  captainId: string,
  targetRiderId: string,
): Promise<boolean> => {
  // Verify caller is the captain
  const rideCheck = await query(
    `SELECT id FROM rides WHERE id = $1 AND captain_id = $2`,
    [rideId, captainId],
  );
  if (rideCheck.rows.length === 0) return false;

  const result = await query(
    `UPDATE ride_participants
     SET role = 'co_captain'
     WHERE ride_id = $1 AND rider_id = $2 AND role = 'rider' AND status = 'confirmed'
     RETURNING id`,
    [rideId, targetRiderId],
  );
  return result.rows.length > 0;
};

// ---- Ride Stops ----

/**
 * Any participant can request a stop on a ride.
 */
export const requestStop = async (
  rideId: string,
  riderId: string,
  data: RequestStopInput,
): Promise<RideStop | null> => {
  // Verify rider is a participant
  const participantCheck = await query(
    `SELECT id FROM ride_participants WHERE ride_id = $1 AND rider_id = $2 AND status = 'confirmed'`,
    [rideId, riderId],
  );
  if (participantCheck.rows.length === 0) return null;

  // Check if requester is captain/co-captain — auto-approve
  const roleCheck = await query(
    `SELECT role FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
    [rideId, riderId],
  );
  const role = roleCheck.rows[0]?.role;
  const isLeader = role === "captain" || role === "co_captain";

  const result = await query(
    `INSERT INTO ride_stops (ride_id, requested_by, approved_by, type, location, status, created_at)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, now())
     RETURNING *`,
    [
      rideId,
      riderId,
      isLeader ? riderId : null,
      data.type,
      data.location_coords[0],
      data.location_coords[1],
      isLeader ? "approved" : "pending",
    ],
  );
  return result.rows.length ? (result.rows[0] as RideStop) : null;
};

/**
 * Captain or co-captain approves/rejects a stop request.
 */
export const handleStopRequest = async (
  rideId: string,
  stopId: string,
  captainId: string,
  decision: "approved" | "rejected",
): Promise<boolean> => {
  // Verify caller is captain or co-captain of this ride
  const authCheck = await query(
    `SELECT role FROM ride_participants
     WHERE ride_id = $1 AND rider_id = $2 AND role IN ('captain', 'co_captain') AND status = 'confirmed'`,
    [rideId, captainId],
  );
  if (authCheck.rows.length === 0) return false;

  const result = await query(
    `UPDATE ride_stops
     SET status = $1, approved_by = $2
     WHERE id = $3 AND ride_id = $4 AND status = 'pending'
     RETURNING id`,
    [decision, captainId, stopId, rideId],
  );
  return result.rows.length > 0;
};

/**
 * List all stops for a ride.
 */
export const listRideStops = async (rideId: string): Promise<RideStop[]> => {
  const result = await query(
    `SELECT rs.*,
            ST_AsGeoJSON(rs.location)::json AS location_geojson,
            req.display_name AS requester_name,
            app.display_name AS approver_name
     FROM ride_stops rs
     LEFT JOIN riders req ON rs.requested_by = req.id
     LEFT JOIN riders app ON rs.approved_by = app.id
     WHERE rs.ride_id = $1
     ORDER BY rs.created_at ASC`,
    [rideId],
  );
  return result.rows as RideStop[];
};

/**
 * Recalculates the start point for a ride with start_point_auto = true.
 * Uses the geographic centroid of all confirmed riders' locations,
 * then snaps to the nearest accessible place via Google Nearby Search.
 */
export const recalculateStartPoint = async (
  rideId: string,
): Promise<{
  lat: number;
  lng: number;
  name: string;
  address: string;
} | null> => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY not set");
    return null;
  }

  // Verify this ride has start_point_auto enabled and get end_point
  const rideCheck = await query(
    `SELECT 
       start_point_auto, 
       ST_X(end_point::geometry) as dest_lng, 
       ST_Y(end_point::geometry) as dest_lat 
     FROM rides WHERE id = $1`,
    [rideId],
  );
  if (rideCheck.rows.length === 0 || !rideCheck.rows[0].start_point_auto) {
    return null;
  }

  const destRow = rideCheck.rows[0];
  const destination =
    destRow.dest_lat && destRow.dest_lng
      ? { lat: parseFloat(destRow.dest_lat), lng: parseFloat(destRow.dest_lng) }
      : undefined;

  // Get all confirmed riders' locations (preferring override, falling back to home location)
  const participantResult = await query(
    `SELECT 
       rp.rider_id, 
       ST_X(COALESCE(rp.start_location_override, r.location_coords)::geometry) as lng,
       ST_Y(COALESCE(rp.start_location_override, r.location_coords)::geometry) as lat
     FROM ride_participants rp
     JOIN riders r ON rp.rider_id = r.id
     WHERE rp.ride_id = $1 AND rp.status = 'confirmed'
       AND COALESCE(rp.start_location_override, r.location_coords) IS NOT NULL`,
    [rideId],
  );

  const locations = participantResult.rows.map((r: any) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lng),
  }));

  if (locations.length === 0) return null;

  // Calculate the most equitable start point using Geometric Median (Weber Problem)
  const medianPoint = calculateGeometricMedian(locations, destination, 1.5);

  // Snap to nearest accessible place
  const snapped = await snapToNearestPlace(medianPoint, apiKey);

  // Update the ride's start point
  await query(
    `UPDATE rides
     SET start_point = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         start_point_name = $3
     WHERE id = $4`,
    [snapped.lng, snapped.lat, `${snapped.name} — ${snapped.address}`, rideId],
  );

  return snapped;
};

/**
 * Allows a participant to override their auto-calculate start point.
 * Must be at least 12 hours before the ride's scheduled_at time.
 */
export const updateStartLocationOverride = async (
  rideId: string,
  riderId: string,
  locationCoords: [number, number],
): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if ride exists, is auto-start, and starts in > 12 hours
    const rideCheck = await client.query(
      `SELECT scheduled_at, start_point_auto FROM rides WHERE id = $1`,
      [rideId],
    );

    if (rideCheck.rows.length === 0) throw new Error("Ride not found");
    const ride = rideCheck.rows[0];

    if (!ride.start_point_auto)
      throw new Error("Ride does not auto-calculate start points");

    if (ride.scheduled_at) {
      const scheduledTime = new Date(ride.scheduled_at).getTime();
      const now = Date.now();
      const twelveHoursMs = 12 * 60 * 60 * 1000;

      if (scheduledTime - now < twelveHoursMs) {
        throw new Error(
          "Start locations cannot be updated less than 12 hours before the ride begins",
        );
      }
    }

    // Update the participant
    const updateResult = await client.query(
      `UPDATE ride_participants
       SET start_location_override = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       WHERE ride_id = $3 AND rider_id = $4 AND status = 'confirmed'
       RETURNING id`,
      [locationCoords[0], locationCoords[1], rideId, riderId],
    );

    if (updateResult.rows.length === 0) {
      throw new Error("You are not a confirmed participant in this ride");
    }

    await client.query("COMMIT");

    // Recalculate silently
    recalculateStartPoint(rideId).catch(console.error);

    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
