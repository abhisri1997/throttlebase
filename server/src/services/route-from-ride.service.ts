/**
 * Saving a finished ride as a route: the road this rider actually rode,
 * published so others can browse it, bookmark it and plan rides on it.
 *
 * The geometry is built here from the rider's own recorded fixes, never taken
 * from the client, so a route always reflects a ride that happened.
 */
import pool, { query } from "../config/db.js";
import { routeFromTrack } from "../core/routes/routeFromTrack.js";
import {
  keptRouteStops,
  stopChoices,
  type KeptStop,
  type RideStopForRoute,
  type RouteStopDraft,
  type StopChoice,
} from "../core/routes/routeStops.js";
import type { SaveRouteFromRideInput } from "../schemas/route.schemas.js";
import { reverseGeocodeArea } from "./maps.service.js";
import { resolveMapsProvider } from "./maps/resolveProvider.js";
import { LiveSessionError } from "./live-session.service.js";
import { assertConfirmedParticipant, loadRiderSamples } from "./ride-track.service.js";
import { ROUTE_COLUMNS, type Route } from "./route.service.js";

type LatLngPoint = { lat: number; lng: number };

/** Highlights and stop notes are optional; everything else is required. */
export type SaveRouteFromRideRequest = Pick<SaveRouteFromRideInput, "title" | "visibility"> &
  Partial<Pick<SaveRouteFromRideInput, "highlights" | "stop_notes" | "stops">>;

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

/** Everything a saved route is made of, worked out without writing anything. */
interface PreparedRoute {
  geometry: NonNullable<ReturnType<typeof routeFromTrack>>;
  start: LatLngPoint;
  end: LatLngPoint;
  startName: string | null;
  endName: string | null;
  /** Every stop the saver can keep: planned ones ridden past or skipped, and ones they found. */
  choices: StopChoice[];
}

interface SavableRide {
  start_point_name: string | null;
  end_point_name: string | null;
}

/** Only a confirmed participant's completed ride can become a route. */
const assertSavable = async (rideId: string, riderId: string): Promise<SavableRide> => {
  await assertConfirmedParticipant(rideId, riderId);

  const rideResult = await query(
    `SELECT status, start_point_name, end_point_name FROM rides WHERE id = $1`,
    [rideId],
  );
  const ride = rideResult.rows[0];
  if (ride?.status !== "completed") {
    throw new LiveSessionError("A ride can be saved as a route once it is completed", 409);
  }
  return { start_point_name: ride.start_point_name ?? null, end_point_name: ride.end_point_name ?? null };
};

/** A stop the rider found is named by its area, like the route's ends. */
const nameFoundStops = (
  choices: readonly StopChoice[],
  nameArea: (point: LatLngPoint) => Promise<string | null>,
): Promise<StopChoice[]> =>
  Promise.all(
    choices.map(async (choice) =>
      choice.kind === "discovered" ? { ...choice, name: await nameOrNull(nameArea, choice) } : choice,
    ),
  );

/** What older apps ask for: the planned stops ridden past, with their notes. */
const plannedStopsRiddenPast = (
  choices: readonly StopChoice[],
  noteFor: (choice: StopChoice) => string | null | undefined,
): Map<string, KeptStop> =>
  new Map(
    choices
      .filter((choice) => choice.kind === "planned" && choice.status === "visited")
      .map((choice) => [choice.key, { note: noteFor(choice) ?? null }]),
  );

const prepareRoute = async (
  rideId: string,
  riderId: string,
  ride: SavableRide,
  deps: SaveRouteFromRideDeps,
): Promise<PreparedRoute> => {
  const [sessionResult, plannedStops] = await Promise.all([
    query(`SELECT id FROM ride_live_sessions WHERE ride_id = $1`, [rideId]),
    loadRideStops(rideId),
  ]);
  const sessionId = sessionResult.rows[0]?.id;
  const geometry = sessionId
    ? routeFromTrack(await loadRiderSamples(String(sessionId), riderId), plannedStops)
    : null;
  if (!geometry) {
    throw new LiveSessionError("Not enough of this ride was recorded to make a route", 422);
  }

  const [startLng, startLat] = geometry.coordinates[0]!;
  const [endLng, endLat] = geometry.coordinates[geometry.coordinates.length - 1]!;
  const start = { lat: startLat, lng: startLng };
  const end = { lat: endLat, lng: endLng };
  const nameArea = deps.nameArea ?? noAreaName;
  const choices = stopChoices({
    coordinates: geometry.coordinates,
    routeDistanceKm: geometry.distanceKm,
    plannedStops,
    rideStops: geometry.stops,
  });
  // Named before any transaction, so no Google call holds a database connection.
  const [startArea, endArea, namedChoices] = await Promise.all([
    nameOrNull(nameArea, start),
    nameOrNull(nameArea, end),
    nameFoundStops(choices, nameArea),
  ]);

  return {
    geometry,
    start,
    end,
    startName: startArea ?? ride.start_point_name,
    endName: endArea ?? ride.end_point_name,
    choices: namedChoices,
  };
};

/** A stop as the save sheet lists it. */
export interface RouteStopChoice {
  key: string;
  kind: StopChoice["kind"];
  status: StopChoice["status"];
  ride_stop_id: string | null;
  name: string | null;
  distance_from_start_km: number | null;
  /** How long the rider was off the bike there, when they got off. */
  stopped_s: number | null;
  walked_away: boolean;
  /** Ticked to start with. */
  suggested: boolean;
}

const toStopChoice = (choice: StopChoice): RouteStopChoice => ({
  key: choice.key,
  kind: choice.kind,
  status: choice.status,
  ride_stop_id: choice.rideStopId,
  name: choice.name,
  distance_from_start_km: choice.distanceFromStartKm,
  stopped_s: choice.stoppedS,
  walked_away: choice.walkedAway,
  suggested: choice.suggested,
});

export interface RoutePreview {
  /** Set when this rider already saved this ride; open that route instead. */
  saved_route_id: string | null;
  start_name: string | null;
  end_name: string | null;
  distance_km: number;
  duration_s: number;
  /** The planned stops ridden past, as older apps list them. */
  stops: { ride_stop_id: string; name: string | null; distance_from_start_km: number }[];
  /** Every stop the saver can keep, in road order, skipped stops last. */
  stop_choices: RouteStopChoice[];
}

/** What saving this ride would produce, for the save sheet. Writes nothing. */
export const previewRouteFromRide = async (
  rideId: string,
  riderId: string,
  deps: SaveRouteFromRideDeps = {},
): Promise<RoutePreview> => {
  const ride = await assertSavable(rideId, riderId);

  const existing = await findSavedRoute(rideId, riderId);
  if (existing) {
    return {
      saved_route_id: existing.id,
      start_name: existing.start_name,
      end_name: existing.end_name,
      distance_km: Number(existing.distance_km ?? 0),
      duration_s: Number(existing.ridden_duration_s ?? 0),
      stops: [],
      stop_choices: [],
    };
  }

  const prepared = await prepareRoute(rideId, riderId, ride, deps);
  return {
    saved_route_id: null,
    start_name: prepared.startName,
    end_name: prepared.endName,
    distance_km: prepared.geometry.distanceKm,
    duration_s: prepared.geometry.durationS,
    stops: prepared.choices
      .filter((choice) => choice.kind === "planned" && choice.status === "visited")
      .map((choice) => ({
        ride_stop_id: choice.rideStopId!,
        name: choice.name,
        distance_from_start_km: choice.distanceFromStartKm!,
      })),
    stop_choices: prepared.choices.map(toStopChoice),
  };
};

export interface RouteRebuild {
  routeId: string;
  before: { distanceKm: number; durationS: number };
  after: { distanceKm: number; durationS: number };
}

/**
 * Rebuilds a route saved from a ride with the current rules (riding only,
 * stops where the bike was parked), from the saver's own track. Its title,
 * names, highlights and stop notes stay. Null for a route with no ride, or
 * whose ride has no track left to build from.
 */
export const rebuildRouteFromRide = async (
  routeId: string,
  options: { dryRun?: boolean } = {},
): Promise<RouteRebuild | null> => {
  const routeResult = await query(
    `SELECT ride_id, creator_id, start_name, end_name, distance_km, ridden_duration_s FROM routes WHERE id = $1`,
    [routeId],
  );
  const row = routeResult.rows[0];
  if (!row?.ride_id) return null;

  let prepared: PreparedRoute;
  try {
    // No naming: the route keeps the names it has.
    prepared = await prepareRoute(
      String(row.ride_id),
      String(row.creator_id),
      { start_point_name: row.start_name ?? null, end_point_name: row.end_name ?? null },
      {},
    );
  } catch (error) {
    if (error instanceof LiveSessionError && error.statusCode === 422) return null;
    throw error;
  }

  // Stops come from the same ride stops, so a note finds its stop by name.
  const noteRows = await query(`SELECT name, note FROM route_stops WHERE route_id = $1 AND note IS NOT NULL`, [routeId]);
  const notesByName = new Map<string, string>(noteRows.rows.map((note) => [String(note.name), String(note.note)]));
  // Rebuilt without the rider to ask, so stops they found stay off, as they were.
  const stops = keptRouteStops(
    prepared.choices,
    plannedStopsRiddenPast(prepared.choices, (choice) => (choice.name ? notesByName.get(choice.name) : null)),
  );
  const rebuild: RouteRebuild = {
    routeId,
    before: { distanceKm: Number(row.distance_km ?? 0), durationS: Number(row.ridden_duration_s ?? 0) },
    after: { distanceKm: prepared.geometry.distanceKm, durationS: prepared.geometry.durationS },
  };
  if (options.dryRun) return rebuild;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE routes
       SET geojson = $2, distance_km = $3, ridden_duration_s = $4,
           start_point = ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
           end_point = ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography
       WHERE id = $1`,
      [
        routeId,
        JSON.stringify({ type: "LineString", coordinates: prepared.geometry.coordinates }),
        prepared.geometry.distanceKm,
        prepared.geometry.durationS,
        prepared.start.lng,
        prepared.start.lat,
        prepared.end.lng,
        prepared.end.lat,
      ],
    );
    await client.query(`DELETE FROM route_stops WHERE route_id = $1`, [routeId]);
    await insertStops(client, routeId, stops);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return rebuild;
};

export const saveRouteFromRide = async (
  rideId: string,
  riderId: string,
  input: SaveRouteFromRideRequest,
  deps: SaveRouteFromRideDeps = {},
): Promise<SavedRouteFromRide> => {
  const ride = await assertSavable(rideId, riderId);

  // Saving twice (a double tap, a retry) returns the route already saved.
  const existing = await findSavedRoute(rideId, riderId);
  if (existing) return { route: existing, created: false };

  const { geometry, start, end, startName, endName, choices } = await prepareRoute(rideId, riderId, ride, deps);
  const notesByRideStopId = new Map((input.stop_notes ?? []).map((entry) => [entry.ride_stop_id, entry.note]));
  const kept = input.stops
    ? new Map<string, KeptStop>(input.stops.map((stop) => [stop.key, { note: stop.note ?? null, name: stop.name ?? null }]))
    : plannedStopsRiddenPast(choices, (choice) => notesByRideStopId.get(choice.rideStopId ?? ""));
  const stops: RouteStopDraft[] = keptRouteStops(choices, kept);

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
        startName,
        endName,
        start.lng,
        start.lat,
        end.lng,
        end.lat,
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
