/**
 * Saving a finished ride as a route: the road this rider actually rode,
 * published so others can browse it, bookmark it and plan rides on it.
 *
 * The geometry is built here from the rider's own recorded fixes, never taken
 * from the client, so a route always reflects a ride that happened.
 */
import { query } from "../config/db.js";
import { routeFromTrack } from "../core/routes/routeFromTrack.js";
import type { SaveRouteFromRideInput } from "../schemas/route.schemas.js";
import { LiveSessionError } from "./live-session.service.js";
import { assertConfirmedParticipant, loadRiderSamples } from "./ride-track.service.js";
import type { Route } from "./route.service.js";

export interface SavedRouteFromRide {
  route: Route;
  /** False when this rider had already saved this ride; the earlier route is returned. */
  created: boolean;
}

const findSavedRoute = async (rideId: string, riderId: string): Promise<Route | null> => {
  const result = await query(
    `SELECT * FROM routes
     WHERE creator_id = $1 AND ride_id = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [riderId, rideId],
  );
  return (result.rows[0] as Route | undefined) ?? null;
};

export const saveRouteFromRide = async (
  rideId: string,
  riderId: string,
  input: SaveRouteFromRideInput,
): Promise<SavedRouteFromRide> => {
  await assertConfirmedParticipant(rideId, riderId);

  const rideResult = await query(`SELECT status FROM rides WHERE id = $1`, [rideId]);
  if (rideResult.rows[0]?.status !== "completed") {
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

  const inserted = await query(
    `INSERT INTO routes (creator_id, ride_id, title, geojson, distance_km, visibility)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (SELECT 1 FROM routes WHERE creator_id = $1 AND ride_id = $2)
     RETURNING *`,
    [
      riderId,
      rideId,
      input.title,
      JSON.stringify({ type: "LineString", coordinates: geometry.coordinates }),
      geometry.distanceKm,
      input.visibility,
    ],
  );

  const route = inserted.rows[0] as Route | undefined;
  if (route) return { route, created: true };

  // A concurrent save won the race; hand back its route.
  const raced = await findSavedRoute(rideId, riderId);
  if (!raced) throw new Error("Route insert returned nothing and no saved route exists");
  return { route: raced, created: false };
};
