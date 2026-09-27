import { query } from "../config/db.js";
import { enqueueRideStatsRecompute } from "./jobs.service.js";
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
  start_name: string | null;
  end_name: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  highlights: string[];
  ridden_duration_s: number | null;
  /** Names of the stops in order, for "via Mysuru · Gundlupet". */
  via: string[];
  // JOIN fields
  creator_name?: string;
}

export interface RouteStop {
  position: number;
  name: string | null;
  lat: number;
  lng: number;
  note: string | null;
  distance_from_start_km: number | null;
}

export type RouteWithStops = Route & { stops: RouteStop[] };

/** Every route read uses these, so points come back as numbers, not PostGIS hex. */
export const ROUTE_COLUMNS = `
  r.id, r.creator_id, r.ride_id, r.parent_route_id, r.title, r.geojson,
  r.distance_km, r.elevation_gain_m, r.elevation_loss_m, r.difficulty,
  r.visibility, r.proposal_status, r.created_at,
  r.start_name, r.end_name,
  ST_Y(r.start_point::geometry) AS start_lat, ST_X(r.start_point::geometry) AS start_lng,
  ST_Y(r.end_point::geometry) AS end_lat, ST_X(r.end_point::geometry) AS end_lng,
  r.highlights, r.ridden_duration_s,
  ARRAY(
    SELECT rs.name FROM route_stops rs
    WHERE rs.route_id = r.id AND rs.name IS NOT NULL
    ORDER BY rs.position
  ) AS via`;

export const listRouteStops = async (routeId: string): Promise<RouteStop[]> => {
  const result = await query(
    `SELECT position, name, note,
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
            distance_from_start_km
     FROM route_stops
     WHERE route_id = $1
     ORDER BY position`,
    [routeId],
  );
  return result.rows.map((row) => ({
    position: Number(row.position),
    name: row.name ?? null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    note: row.note ?? null,
    distance_from_start_km: row.distance_from_start_km != null ? Number(row.distance_from_start_km) : null,
  }));
};

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
): Promise<RouteWithStops | null> => {
  // Fetch route with creator name, respecting visibility
  const result = await query(
    `SELECT ${ROUTE_COLUMNS}, rd.display_name AS creator_name
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
  const route = result.rows[0] as Route | undefined;
  if (!route) return null;
  return { ...route, stops: await listRouteStops(routeId) };
};

/** Public routes, plus the viewer's own private ones so "only me" stays findable. */
export const listVisibleRoutes = async (viewerId: string): Promise<Route[]> => {
  const result = await query(
    `SELECT ${ROUTE_COLUMNS}, rd.display_name AS creator_name
     FROM routes r
     JOIN riders rd ON r.creator_id = rd.id
     WHERE r.visibility = 'public' OR r.creator_id = $1
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [viewerId],
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

  const rideStateResult = await query(
    `SELECT status FROM rides WHERE id = $1 LIMIT 1`,
    [data.ride_id],
  );

  const rideStatus = rideStateResult.rows[0]?.status;
  if (rideStatus === "completed") {
    enqueueRideStatsRecompute(data.ride_id, "gps-ingest").catch((error) => {
      console.error("Failed to enqueue ride stats from GPS ingest:", error);
    });
  }

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
