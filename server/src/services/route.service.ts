import { query } from "../config/db.js";
import type {
  CreateRouteInput,
  GpsTraceBatchInput,
} from "../schemas/route.schemas.js";

/**
 * RouteService — Business logic for routes, bookmarks, sharing, and GPS traces.
 *
 * Learning Note:
 * Routes store path data as GeoJSON in a JSONB column.
 * GPS traces are time-series telemetry points recorded during a ride.
 */

export interface Route {
  id: string;
  creator_id: string;
  ride_id: string | null;
  parent_route_id: string | null;
  title: string;
  geojson: object;
  distance_km: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  difficulty: string | null;
  visibility: string;
  proposal_status: string | null;
  created_at: string;
  // JOIN fields
  creator_name?: string;
}

// ---------------------------------------------------------------------------
// Routes CRUD
// ---------------------------------------------------------------------------

export const createRoute = async (
  creatorId: string,
  data: CreateRouteInput,
): Promise<Route> => {
  const result = await query(
    `INSERT INTO routes (
       creator_id, title, geojson, ride_id, parent_route_id,
       distance_km, elevation_gain_m, elevation_loss_m,
       difficulty, visibility, proposal_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      creatorId,
      data.title,
      JSON.stringify(data.geojson),
      data.ride_id || null,
      data.parent_route_id || null,
      data.distance_km || null,
      data.elevation_gain_m || null,
      data.elevation_loss_m || null,
      data.difficulty || null,
      data.visibility,
      data.proposal_status || null,
    ],
  );
  return result.rows[0] as Route;
};

export const getRouteById = async (
  routeId: string,
  viewerId: string,
): Promise<Route | null> => {
  // Fetch route with creator name, respecting visibility
  const result = await query(
    `SELECT r.*, rd.display_name AS creator_name
     FROM routes r
     JOIN riders rd ON r.creator_id = rd.id
     WHERE r.id = $1
       AND (
         r.visibility = 'public'
         OR r.creator_id = $2
         OR EXISTS (
           SELECT 1 FROM route_shares rs
           WHERE rs.route_id = r.id AND rs.shared_with_rider_id = $2
         )
       )`,
    [routeId, viewerId],
  );
  return result.rows.length ? (result.rows[0] as Route) : null;
};

export const listPublicRoutes = async (): Promise<Route[]> => {
  const result = await query(
    `SELECT r.*, rd.display_name AS creator_name
     FROM routes r
     JOIN riders rd ON r.creator_id = rd.id
     WHERE r.visibility = 'public'
     ORDER BY r.created_at DESC
     LIMIT 50`,
  );
  return result.rows as Route[];
};

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export const bookmarkRoute = async (
  routeId: string,
  riderId: string,
): Promise<boolean> => {
  const result = await query(
    `INSERT INTO route_bookmarks (route_id, rider_id)
     VALUES ($1, $2)
     ON CONFLICT (route_id, rider_id) DO NOTHING
     RETURNING id`,
    [routeId, riderId],
  );
  return result.rows.length > 0;
};

export const unbookmarkRoute = async (
  routeId: string,
  riderId: string,
): Promise<boolean> => {
  const result = await query(
    `DELETE FROM route_bookmarks
     WHERE route_id = $1 AND rider_id = $2
     RETURNING id`,
    [routeId, riderId],
  );
  return result.rows.length > 0;
};

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export const shareRouteWithRider = async (
  routeId: string,
  sharedWithRiderId: string,
): Promise<boolean> => {
  const result = await query(
    `INSERT INTO route_shares (route_id, shared_with_rider_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [routeId, sharedWithRiderId],
  );
  return result.rows.length > 0;
};

// ---------------------------------------------------------------------------
// GPS Traces
// ---------------------------------------------------------------------------

export const ingestGpsTraces = async (
  riderId: string,
  data: GpsTraceBatchInput,
): Promise<number> => {
  // Build a multi-row INSERT for batch efficiency
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < data.traces.length; i++) {
    const point = data.traces[i]!;
    const base = i * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
    );
    values.push(
      data.ride_id,
      riderId,
      point?.latitude,
      point?.longitude,
      point?.altitude_m ?? null,
      point?.speed_kmh ?? null,
      point?.recorded_at,
    );
  }

  const result = await query(
    `INSERT INTO gps_traces (ride_id, rider_id, latitude, longitude, altitude_m, speed_kmh, recorded_at)
     VALUES ${placeholders.join(", ")}`,
    values,
  );

  return result.rowCount ?? 0;
};

export const getRideGpsTraces = async (
  rideId: string,
  riderId: string,
): Promise<any[]> => {
  const result = await query(
    `SELECT latitude, longitude, altitude_m, speed_kmh, recorded_at
     FROM gps_traces
     WHERE ride_id = $1 AND rider_id = $2
     ORDER BY recorded_at ASC`,
    [rideId, riderId],
  );
  return result.rows;
};
