/**
 * Keeps a deleted rider's public routes for the community when their account
 * is purged, anonymised (core/routes/communityRoute.ts): no creator, ends at
 * public places kept and others trimmed, stops renamed by area with notes
 * dropped, and a title made from the ends' names. Their highlights, other
 * riders' bookmarks and other riders' road feedback stay. Everything else
 * of theirs, private and shared routes included, the purge deletes.
 *
 * Planned before the purge's transaction, because it asks Google what is at
 * each end, and no lookup should hold a database connection. A lookup that
 * fails counts as "nothing public here": that end is trimmed.
 */
import type { PoolClient } from "pg";
import { query } from "../config/db.js";
import {
  communityRouteTitle,
  HOME_LIKE_PLACE_TYPES,
  planCommunityRoute,
  PUBLIC_PLACE_RADIUS_METERS,
  PUBLIC_PLACE_TYPES,
  type CommunityRoutePlan,
  type PublicPlace,
} from "../core/routes/communityRoute.js";
import { routeLine } from "../core/routes/roadVia.js";
import { resolveMapsProvider } from "./maps/resolveProvider.js";
import { nameAreaWithGoogle } from "./route-from-ride.service.js";

type Point = { lat: number; lng: number };

export interface CommunityRouteLookups {
  /** A clearly public place at a point, or null. */
  findPublicPlace: (point: Point) => Promise<PublicPlace | null>;
  /** The area a point is in ("HSR Layout, Bengaluru"), or null. */
  nameArea: (point: Point) => Promise<string | null>;
}

const findPublicPlaceWithGoogle = async (point: Point): Promise<PublicPlace | null> => {
  const provider = resolveMapsProvider();
  if (!provider) return null;
  const [place] = await provider.searchNearby({
    lat: point.lat,
    lng: point.lng,
    radiusMeters: PUBLIC_PLACE_RADIUS_METERS,
    includedTypes: [...PUBLIC_PLACE_TYPES],
    excludedTypes: [...HOME_LIKE_PLACE_TYPES],
    rankByDistance: true,
    maxResultCount: 1,
  });
  return place ? { name: place.name, lat: place.lat, lng: place.lng } : null;
};

export const GOOGLE_LOOKUPS: CommunityRouteLookups = {
  findPublicPlace: findPublicPlaceWithGoogle,
  nameArea: nameAreaWithGoogle,
};

/** For tests and for running without Google: every end is trimmed and nothing is named. */
export const NO_LOOKUPS: CommunityRouteLookups = {
  findPublicPlace: async () => null,
  nameArea: async () => null,
};

/** A lookup that fails, for an outage or a spent quota, finds nothing. */
const orNull = async <T>(lookup: () => Promise<T | null>): Promise<T | null> => {
  try {
    return await lookup();
  } catch (error) {
    console.warn("[purge] a place lookup failed; treating it as none:", error instanceof Error ? error.message : error);
    return null;
  }
};

export interface CommunityRouteChange {
  routeId: string;
  plan: CommunityRoutePlan;
  title: string;
  startName: string | null;
  endName: string | null;
  stopNames: (string | null)[];
}

const loadStops = async (routeId: string): Promise<Point[]> => {
  const result = await query(
    `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM route_stops WHERE route_id = $1 ORDER BY position`,
    [routeId],
  );
  return result.rows.map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) }));
};

const toPoint = ([lng, lat]: readonly [number, number]): Point => ({ lat, lng });

/** What each of the rider's public routes would become; routes left out are deleted by the purge. */
export const planCommunityRoutesOf = async (
  riderId: string,
  lookups: CommunityRouteLookups,
): Promise<CommunityRouteChange[]> => {
  const routes = await query(
    `SELECT id::text AS id, geojson FROM routes WHERE creator_id = $1 AND visibility = 'public' ORDER BY created_at`,
    [riderId],
  );

  const changes: CommunityRouteChange[] = [];
  for (const route of routes.rows as Array<{ id: string; geojson: unknown }>) {
    const line = routeLine(route.geojson);
    if (line.length < 2) continue;

    const [startPlace, endPlace] = await Promise.all([
      orNull(() => lookups.findPublicPlace(toPoint(line[0]!))),
      orNull(() => lookups.findPublicPlace(toPoint(line[line.length - 1]!))),
    ]);
    const plan = planCommunityRoute({ line, stops: await loadStops(route.id), startPlace, endPlace });
    if (!plan) continue;

    const [startName, endName, ...stopNames] = await Promise.all([
      plan.startName ?? orNull(() => lookups.nameArea(plan.start)),
      plan.endName ?? orNull(() => lookups.nameArea(plan.end)),
      ...plan.stops.map((stop) => orNull(() => lookups.nameArea(stop))),
    ]);
    changes.push({
      routeId: route.id,
      plan,
      title: communityRouteTitle(startName ?? null, endName ?? null),
      startName: startName ?? null,
      endName: endName ?? null,
      stopNames,
    });
  }
  return changes;
};

const POINT_SQL = (lng: string, lat: string) => `ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;

/**
 * In the purge's transaction: turns each planned route into a community
 * route. Only a route that is still the rider's and still public changes.
 * Returns how many were kept.
 */
export const keepCommunityRoutes = async (
  client: PoolClient,
  riderId: string,
  changes: readonly CommunityRouteChange[],
): Promise<number> => {
  let kept = 0;
  for (const { routeId, plan, title, startName, endName, stopNames } of changes) {
    const updated = await client.query(
      `UPDATE routes
          SET creator_id = NULL,
              title = $3,
              geojson = $4::jsonb,
              distance_km = $5,
              start_point = ${POINT_SQL("$6", "$7")},
              end_point = ${POINT_SQL("$8", "$9")},
              start_name = $10,
              end_name = $11,
              ridden_duration_s = NULL,
              ride_id = NULL,
              share_token = NULL,
              share_token_expires_at = NULL
        WHERE id = $1 AND creator_id = $2 AND visibility = 'public'`,
      [
        routeId,
        riderId,
        title,
        JSON.stringify({ type: "LineString", coordinates: plan.coordinates }),
        Math.round(plan.lengthMeters / 10) / 100,
        plan.start.lng,
        plan.start.lat,
        plan.end.lng,
        plan.end.lat,
        startName,
        endName,
      ],
    );
    if (updated.rowCount === 0) continue;

    // Stops are rewritten: trimmed ones go, notes go, names come from the area.
    await client.query(`DELETE FROM route_stops WHERE route_id = $1`, [routeId]);
    for (const [index, stop] of plan.stops.entries()) {
      await client.query(
        `INSERT INTO route_stops (route_id, position, name, location, distance_from_start_km)
         VALUES ($1, $2, $3, ${POINT_SQL("$4", "$5")}, $6)`,
        [routeId, stop.position, stopNames[index] ?? null, stop.lng, stop.lat, stop.distanceFromStartKm],
      );
    }
    // A public route needs no shares, and they name who the rider shared with.
    await client.query(`DELETE FROM route_shares WHERE route_id = $1`, [routeId]);
    kept += 1;
  }
  return kept;
};
