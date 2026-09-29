import { query } from "../config/db.js";
import {
  MAX_SEARCH_RADIUS_KM,
  rankRouteMatches,
  type RouteDirection,
  type RouteSearchQuery,
  type SearchPlace,
} from "../core/routes/routeSearch.js";
import { roadViaPoints, routeLine } from "../core/routes/roadVia.js";
import { enqueueRideStatsRecompute } from "./jobs.service.js";
import { getRouteRoadFeedback, type RouteRoadFeedback } from "./road-feedback.service.js";
import { blockedBetweenSql } from "./blocks.js";
import type {
  CreateRouteInput,
  GpsTraceBatchInput,
  RouteVisibility,
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
  /** Null for a community route: kept, anonymised, after its rider left. */
  creator_id: string | null;
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

export type RouteWithStops = Route & {
  /** How riders who followed this road found it. */
  road_feedback: RouteRoadFeedback;
  stops: RouteStop[];
  /** Points that hold a ride to this road, start to end; see core/routes/roadVia. */
  road_via: [number, number][];
};

/**
 * A route whose rider is still here, or a community route, which has no
 * rider. A rider who deleted their account takes their routes with them
 * until the purge, which deletes them or keeps public ones anonymised.
 * For queries that LEFT JOIN riders as `rd` on the creator.
 */
const LIVE_OR_COMMUNITY = "(r.creator_id IS NULL OR rd.deleted_at IS NULL)";

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
  // Fetch route with creator name, respecting visibility.
  const result = await query(
    `SELECT ${ROUTE_COLUMNS}, rd.display_name AS creator_name
     FROM routes r
     LEFT JOIN riders rd ON r.creator_id = rd.id
     WHERE r.id = $1
       AND ${LIVE_OR_COMMUNITY}
       -- Hidden from, and never shown by, a rider blocked either way. A
       -- community route has no rider, so no block hides it.
       AND (r.creator_id = $2 OR NOT ${blockedBetweenSql("$2::uuid", "r.creator_id")})
       AND (
         r.visibility = 'public'
         OR r.creator_id = $2
         -- Shares count only while the owner keeps the route shared: made
         -- private, it is theirs alone again.
         OR (
           r.visibility = 'specific_riders'
           AND EXISTS (
             SELECT 1 FROM route_shares rs
             WHERE rs.route_id = r.id AND rs.shared_with_rider_id = $2
           )
         )
       )`,
    [routeId, viewerId],
  );
  const route = result.rows[0] as Route | undefined;
  if (!route) return null;
  return {
    ...route,
    road_feedback: await getRouteRoadFeedback(routeId),
    stops: await listRouteStops(routeId),
    road_via: roadViaPoints(routeLine(route.geojson)),
  };
};

/** Public routes, plus the viewer's own private ones so "only me" stays findable. */
export const listVisibleRoutes = async (viewerId: string): Promise<Route[]> => {
  const result = await query(
    `SELECT ${ROUTE_COLUMNS}, rd.display_name AS creator_name
     FROM routes r
     LEFT JOIN riders rd ON r.creator_id = rd.id
     WHERE (r.visibility = 'public' OR r.creator_id = $1) AND ${LIVE_OR_COMMUNITY}
       AND (r.creator_id = $1 OR NOT ${blockedBetweenSql("$1::uuid", "r.creator_id")})
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [viewerId],
  );
  return result.rows as Route[];
};

// ---------------------------------------------------------------------------
// The owner's control over their routes
// ---------------------------------------------------------------------------

/**
 * The owner deletes their route, at once and for good. Its stops, shares,
 * bookmarks and other riders' road feedback on it go with it. Rides planned
 * on it keep the road they were planned on (copied into rides.road_via) and
 * lose only the link. False when there is no such route of theirs.
 */
export const deleteRoute = async (routeId: string, ownerId: string): Promise<boolean> => {
  const result = await query(`DELETE FROM routes WHERE id = $1 AND creator_id = $2 RETURNING id`, [routeId, ownerId]);
  return result.rows.length > 0;
};

/**
 * The owner changes who can see their route. Made private, it leaves search,
 * the Routes list and other riders' bookmarks at once. Null when there is no
 * such route of theirs.
 */
export const setRouteVisibility = async (
  routeId: string,
  ownerId: string,
  visibility: RouteVisibility,
): Promise<{ id: string; visibility: RouteVisibility } | null> => {
  const result = await query(
    `UPDATE routes SET visibility = $3 WHERE id = $1 AND creator_id = $2 RETURNING id, visibility`,
    [routeId, ownerId, visibility],
  );
  return (result.rows[0] as { id: string; visibility: RouteVisibility } | undefined) ?? null;
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

export type ShareOutcome = "shared" | "already_shared" | "not_found";

/**
 * The owner shares their route with another rider. Only the owner can: a
 * share grants access to the route. "not_found" when the route isn't theirs
 * or the rider doesn't exist.
 */
export const shareRouteWithRider = async (
  routeId: string,
  ownerId: string,
  sharedWithRiderId: string,
): Promise<ShareOutcome> => {
  const result = await query(
    `WITH target AS (
       SELECT r.id AS route_id, rd.id AS rider_id
         FROM routes r, riders rd
        WHERE r.id = $1 AND r.creator_id = $2
          AND rd.id = $3 AND rd.deleted_at IS NULL
     ),
     inserted AS (
       INSERT INTO route_shares (route_id, shared_with_rider_id)
       SELECT route_id, rider_id FROM target t
        WHERE NOT EXISTS (
          SELECT 1 FROM route_shares rs
           WHERE rs.route_id = t.route_id AND rs.shared_with_rider_id = t.rider_id
        )
       RETURNING id
     )
     SELECT (SELECT count(*) FROM target)::int AS found, (SELECT count(*) FROM inserted)::int AS inserted`,
    [routeId, ownerId, sharedWithRiderId],
  );
  const { found, inserted } = result.rows[0] as { found: number; inserted: number };
  if (found === 0) return "not_found";
  return inserted > 0 ? "shared" : "already_shared";
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

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Enough for any real search; the ranking keeps the best of them. */
const MAX_SEARCH_CANDIDATES = 300;
const MAX_SEARCH_RESULTS = 50;

export type RouteSearchResult = Route & {
  match: { direction: RouteDirection; start_gap_km: number | null; end_gap_km: number | null };
};

/** "Wayanad, Kerala" → "%wayanad%", with LIKE's wildcards escaped. */
const likePattern = (name: string | null): string | null => {
  const term = name?.split(",")[0]?.trim().toLowerCase();
  return term ? `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
};

/**
 * Routes that answer a from/to search. SQL shortlists the ones the viewer can
 * see that are within the largest radius of a searched place or named after
 * it; rankRouteMatches then applies each route's own radius, direction and
 * filters, and orders them.
 */
export const searchRoutes = async (viewerId: string, search: RouteSearchQuery): Promise<RouteSearchResult[]> => {
  const params: unknown[] = [viewerId];
  const param = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const placeConditions = ([search.from, search.to] as (SearchPlace | null)[])
    .filter((place): place is SearchPlace => place !== null)
    .map((place) => {
      const point = `ST_SetSRID(ST_MakePoint(${param(place.lng)}::float8, ${param(place.lat)}::float8), 4326)::geography`;
      const radius = param(MAX_SEARCH_RADIUS_KM * 1000);
      const conditions = [
        `ST_DWithin(r.start_point, ${point}, ${radius})`,
        `ST_DWithin(r.end_point, ${point}, ${radius})`,
      ];
      const pattern = likePattern(place.name);
      if (pattern) {
        const like = param(pattern);
        conditions.push(
          `r.start_name ILIKE ${like}`,
          `r.end_name ILIKE ${like}`,
          `EXISTS (SELECT 1 FROM route_stops rs WHERE rs.route_id = r.id AND rs.name ILIKE ${like})`,
        );
      }
      return `(${conditions.join(" OR ")})`;
    });

  const result = await query(
    `SELECT ${ROUTE_COLUMNS}, rd.display_name AS creator_name
     FROM routes r
     LEFT JOIN riders rd ON r.creator_id = rd.id
     WHERE (r.visibility = 'public' OR r.creator_id = $1)
       AND ${LIVE_OR_COMMUNITY}
       AND (r.creator_id = $1 OR NOT ${blockedBetweenSql("$1::uuid", "r.creator_id")})
       ${placeConditions.length > 0 ? `AND (${placeConditions.join(" OR ")})` : ""}
     ORDER BY r.created_at DESC
     LIMIT ${MAX_SEARCH_CANDIDATES}`,
    params,
  );
  const routes = result.rows as Route[];

  const matches = rankRouteMatches(
    routes.map((route) => ({
      id: route.id,
      distance_km: route.distance_km != null ? Number(route.distance_km) : null,
      start: route.start_lat != null ? { lat: Number(route.start_lat), lng: Number(route.start_lng) } : null,
      end: route.end_lat != null ? { lat: Number(route.end_lat), lng: Number(route.end_lng) } : null,
      start_name: route.start_name,
      end_name: route.end_name,
      stop_names: route.via ?? [],
      highlights: route.highlights ?? [],
    })),
    search,
  );

  const byId = new Map(routes.map((route) => [route.id, route]));
  const round = (km: number | null) => (km === null ? null : Math.round(km * 10) / 10);
  return matches.slice(0, MAX_SEARCH_RESULTS).map((match) => ({
    ...byId.get(match.id)!,
    match: { direction: match.direction, start_gap_km: round(match.startGapKm), end_gap_km: round(match.endGapKm) },
  }));
};
