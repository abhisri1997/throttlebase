/**
 * Saving a finished ride as a route: the road this rider actually rode,
 * published so others can browse it, bookmark it and plan rides on it.
 *
 * The geometry is built here from the rider's own recorded fixes, never taken
 * from the client, so a route always reflects a ride that happened.
 */
import pool, { query } from "../config/db.js";
import { routeFromTrack } from "../core/routes/routeFromTrack.js";
import { buildRouteStops, type RideStopForRoute, type RouteStopDraft } from "../core/routes/routeStops.js";
import type { SaveRouteFromRideInput } from "../schemas/route.schemas.js";
import { reverseGeocodeArea } from "./maps.service.js";
import { resolveMapsProvider } from "./maps/resolveProvider.js";
import { LiveSessionError } from "./live-session.service.js";
import { assertConfirmedParticipant, loadRiderSamples } from "./ride-track.service.js";
import { ROUTE_COLUMNS, type Route } from "./route.service.js";

type LatLngPoint = { lat: number; lng: number };

/** Highlights and stop notes are optional; everything else is required. */
export type SaveRouteFromRideRequest = Pick<SaveRouteFromRideInput, "title" | "visibility"> &
  Partial<Pick<SaveRouteFromRideInput, "highlights" | "stop_notes">>;

export interface SaveRouteFromRideDeps {
  /**
   * Names the area a point is in. The API passes nameAreaWithGoogle; left out,
   * route ends fall back to the ride's own place names, so nothing but the
   * HTTP layer ever calls Google.
   */
  nameArea?: (point: LatLngPoint) => Promise<string | null>;
}

const noAreaName = async (): Promise<string | null> => null;

export const nameAreaWithGoogle = async (point: LatLngPoint): Promise<string | null> => {
  const provider = resolveMapsProvider();
  if (!provider) return null;
  return (await reverseGeocodeArea(point, { provider })).areaName;
};

/** A name is a nicety: an outage or spent quota must never stop a route saving. */
const nameOrNull = async (
  nameArea: (point: LatLngPoint) => Promise<string | null>,
  point: LatLngPoint,
): Promise<string | null> => {
  try {
    return await nameArea(point);
  } catch (error) {
    console.warn("[routes] could not name a route end:", error instanceof Error ? error.message : error);
    return null;
  }
};

const loadRideStops = async (rideId: string): Promise<RideStopForRoute[]> => {
  const result = await query(
    `SELECT id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM ride_stops
     WHERE ride_id = $1 AND status = 'approved' AND location IS NOT NULL
     ORDER BY sequence NULLS LAST, created_at`,
    [rideId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name ?? null,
    lat: Number(row.lat),
    lng: Number(row.lng),
  }));
};

export interface SavedRouteFromRide {
  route: Route;
  /** False when this rider had already saved this ride; the earlier route is returned. */
  created: boolean;
}

const findSavedRoute = async (rideId: string, riderId: string): Promise<Route | null> => {
  const result = await query(
    `SELECT ${ROUTE_COLUMNS}
     FROM routes r
     WHERE r.creator_id = $1 AND r.ride_id = $2
     ORDER BY r.created_at ASC
     LIMIT 1`,
    [riderId, rideId],
  );
  return (result.rows[0] as Route | undefined) ?? null;
};

const insertStops = async (
  client: { query: typeof query },
  routeId: string,
  stops: readonly RouteStopDraft[],
): Promise<void> => {
  if (stops.length === 0) return;
  await client.query(
    `INSERT INTO route_stops (route_id, position, name, location, note, distance_from_start_km)
     SELECT $1, s.position, s.name,
            ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography,
            s.note, s.distance
     FROM UNNEST($2::int[], $3::text[], $4::float8[], $5::float8[], $6::text[], $7::numeric[])
          AS s(position, name, lat, lng, note, distance)`,
    [
      routeId,
      stops.map((stop) => stop.position),
      stops.map((stop) => stop.name),
      stops.map((stop) => stop.lat),
      stops.map((stop) => stop.lng),
      stops.map((stop) => stop.note),
      stops.map((stop) => stop.distanceFromStartKm),
    ],
  );
};

export const saveRouteFromRide = async (
  rideId: string,
  riderId: string,
  input: SaveRouteFromRideRequest,
  deps: SaveRouteFromRideDeps = {},
): Promise<SavedRouteFromRide> => {
  await assertConfirmedParticipant(rideId, riderId);

  const rideResult = await query(
    `SELECT status, start_point_name, end_point_name FROM rides WHERE id = $1`,
    [rideId],
  );
  const ride = rideResult.rows[0];
  if (ride?.status !== "completed") {
    throw new LiveSessionError("A ride can be saved as a route once it is completed", 409);
  }

  // Saving twice (a double tap, a retry) returns the route already saved.
  const existing = await findSavedRoute(rideId, riderId);
  if (existing) return { route: existing, created: false };

  const sessionResult = await query(`SELECT id FROM ride_live_sessions WHERE ride_id = $1`, [rideId]);
  const sessionId = sessionResult.rows[0]?.id;
  const geometry = sessionId ? routeFromTrack(await loadRiderSamples(String(sessionId), riderId)) : null;
  if (!geometry) {
    throw new LiveSessionError("Not enough of this ride was recorded to make a route", 422);
  }

  const [startLng, startLat] = geometry.coordinates[0]!;
  const [endLng, endLat] = geometry.coordinates[geometry.coordinates.length - 1]!;
  const nameArea = deps.nameArea ?? noAreaName;
  // Named before the transaction, so no Google call holds a database connection.
  const [startArea, endArea, rideStops] = await Promise.all([
    nameOrNull(nameArea, { lat: startLat, lng: startLng }),
    nameOrNull(nameArea, { lat: endLat, lng: endLng }),
    loadRideStops(rideId),
  ]);
  const stops = buildRouteStops({
    coordinates: geometry.coordinates,
    routeDistanceKm: geometry.distanceKm,
    rideStops,
    notesByRideStopId: new Map((input.stop_notes ?? []).map((entry) => [entry.ride_stop_id, entry.note])),
  });

  let createdRouteId: string | undefined;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO routes (
         creator_id, ride_id, title, geojson, distance_km, visibility,
         start_name, end_name, start_point, end_point, highlights, ridden_duration_s
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8,
              ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
              ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography,
              $13, $14
       WHERE NOT EXISTS (SELECT 1 FROM routes WHERE creator_id = $1 AND ride_id = $2)
       RETURNING id`,
      [
        riderId,
        rideId,
        input.title,
        JSON.stringify({ type: "LineString", coordinates: geometry.coordinates }),
        geometry.distanceKm,
        input.visibility,
        startArea ?? ride.start_point_name ?? null,
        endArea ?? ride.end_point_name ?? null,
        startLng,
        startLat,
        endLng,
        endLat,
        input.highlights ?? [],
        geometry.durationS,
      ],
    );

    createdRouteId = inserted.rows[0]?.id as string | undefined;
    if (createdRouteId) await insertStops(client, createdRouteId, stops);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Read back through the same columns every other route read uses. No new id
  // means a concurrent save won the race; its route is the one returned.
  const route = await findSavedRoute(rideId, riderId);
  if (!route) throw new Error("Route insert committed but the route cannot be read back");
  return { route, created: Boolean(createdRouteId) };
};
