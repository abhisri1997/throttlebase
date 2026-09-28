/**
 * Turns the track a rider actually rode into a route others can browse and
 * plan rides on: only the riding (never a walk at a stop), cleaned of GPS
 * noise, measured, and simplified so a long ride is not stored (and listed)
 * as thousands of points.
 */
import { haversineMeters, type LatLng } from "../../utils/polyline.js";
import type { TrackSample } from "../../utils/track.js";
import { segmentRide, type PlannedStopPoint, type RideStop } from "../ride-progress/segmentRide.js";
import { simplifyToAtMost } from "./simplifyLine.js";

/** Shorter than this is a rider who started and stopped, not a route. */
export const MIN_ROUTE_DISTANCE_M = 500;
/** Enough to draw a long ride's every turn on a phone-sized map. */
export const MAX_ROUTE_POINTS = 1000;
/** A point this close to the straight line between its neighbours adds nothing. */
const INITIAL_TOLERANCE_M = 10;

export interface RouteGeometry {
  /** GeoJSON order: [longitude, latitude]. */
  coordinates: [number, number][];
  /** Road ridden, stops and walks left out. */
  distanceKm: number;
  /** Time on the bike, stops left out. */
  durationS: number;
  /** Where the rider got off, each at the spot the bike was parked. */
  stops: RideStop[];
}

/**
 * Douglas–Peucker slows sharply on jittery input, so it is given at most this
 * many points: fixes bunched within the tolerance (standing at a signal) are
 * dropped first, then anything left over is thinned evenly.
 */
const MAX_SIMPLIFY_INPUT = MAX_ROUTE_POINTS * 4;

const thinForSimplify = (points: readonly LatLng[]): LatLng[] => {
  // Spacing is measured from the last point kept, not the previous fix, or a
  // slow ride whose fixes are all close together would lose every corner.
  const spaced: LatLng[] = [];
  points.forEach((point, index) => {
    const isEnd = index === 0 || index === points.length - 1;
    const last = spaced[spaced.length - 1];
    if (isEnd || !last || haversineMeters(last, point) >= INITIAL_TOLERANCE_M) {
      spaced.push(point);
    }
  });
  if (spaced.length <= MAX_SIMPLIFY_INPUT) return spaced;

  const stride = spaced.length / MAX_SIMPLIFY_INPUT;
  const thinned = Array.from(
    { length: MAX_SIMPLIFY_INPUT - 1 },
    (_, i) => spaced[Math.floor(i * stride)]!,
  );
  return [...thinned, spaced[spaced.length - 1]!];
};

export const routeFromTrack = (
  samples: readonly TrackSample[],
  plannedStops: readonly PlannedStopPoint[] = [],
): RouteGeometry | null => {
  const ride = segmentRide(samples, plannedStops);
  // Each stop ends back where the bike was parked, so the stretches join up.
  const points = ride.riding.flat();
  if (points.length < 2 || ride.ridingDistanceM < MIN_ROUTE_DISTANCE_M) return null;

  const candidates = thinForSimplify(points);
  const kept = simplifyToAtMost(candidates, MAX_ROUTE_POINTS, INITIAL_TOLERANCE_M);

  return {
    coordinates: kept.map((index) => [candidates[index]!.lng, candidates[index]!.lat]),
    distanceKm: Math.round(ride.ridingDistanceM / 10) / 100,
    durationS: ride.ridingTimeS,
    stops: ride.stops,
  };
};
