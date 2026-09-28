/**
 * The stops a saved route keeps from its ride: the ones the rider actually rode
 * past, in the ride's order, each measured along the route and carrying the
 * saver's optional note.
 */
import { cumulativeDistances, projectOntoPolyline, type LatLng } from "../../utils/polyline.js";

/** A planned stop further than this from the recorded line was not visited on the ride. */
export const MAX_STOP_OFFSET_M = 1000;

export interface RideStopForRoute {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
}

export interface RouteStopDraft {
  /** The ride stop it was copied from, so the saver's note finds it. */
  rideStopId: string;
  position: number;
  name: string | null;
  lat: number;
  lng: number;
  note: string | null;
  distanceFromStartKm: number;
}

/**
 * Moves each planned stop the rider parked for to where the bike was. A stop is
 * often somewhere a bike can't go (a campus, a market, a temple); the route
 * sends the next ride to the parking, and keeps the place's name.
 */
export const placeAtParking = (
  rideStops: readonly RideStopForRoute[],
  parkings: readonly { plannedStopId: string | null; parkedAt: LatLng }[],
): RideStopForRoute[] =>
  rideStops.map((stop) => {
    const parking = parkings.find((entry) => entry.plannedStopId === stop.id);
    return parking ? { ...stop, lat: parking.parkedAt.lat, lng: parking.parkedAt.lng } : stop;
  });

export const buildRouteStops = (input: {
  /** The saved route's line, GeoJSON order: [longitude, latitude]. */
  coordinates: readonly [number, number][];
  /** The distance actually ridden; the simplified line is a little shorter. */
  routeDistanceKm: number;
  /** In the ride's order. */
  rideStops: readonly RideStopForRoute[];
  notesByRideStopId: ReadonlyMap<string, string>;
}): RouteStopDraft[] => {
  const line: LatLng[] = input.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const cumulative = cumulativeDistances(line);
  const lineLengthM = cumulative[cumulative.length - 1] ?? 0;
  const scale = lineLengthM > 0 ? (input.routeDistanceKm * 1000) / lineLengthM : 1;

  return input.rideStops
    .map((stop) => ({ stop, projection: projectOntoPolyline({ lat: stop.lat, lng: stop.lng }, line, cumulative) }))
    .filter(({ projection }) => projection.offsetMeters <= MAX_STOP_OFFSET_M)
    .map(({ stop, projection }, index) => ({
      rideStopId: stop.id,
      position: index + 1,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      note: input.notesByRideStopId.get(stop.id)?.trim() || null,
      distanceFromStartKm: Math.round((projection.distanceAlongMeters * scale) / 10) / 100,
    }));
};
