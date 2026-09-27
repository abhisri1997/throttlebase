/**
 * Turns the track a rider actually rode into a route others can browse and
 * plan rides on: cleaned of GPS noise, measured, and simplified so a long
 * ride is not stored (and listed) as thousands of points.
 */
import { haversineMeters, type LatLng } from "../../utils/polyline.js";
import { cleanTrack, type TrackSample } from "../../utils/track.js";

/** Shorter than this is a rider who started and stopped, not a route. */
export const MIN_ROUTE_DISTANCE_M = 500;
/** Enough to draw a long ride's every turn on a phone-sized map. */
export const MAX_ROUTE_POINTS = 1000;
/** A point this close to the straight line between its neighbours adds nothing. */
const INITIAL_TOLERANCE_M = 10;
const TOLERANCE_GROWTH = 1.5;

const EARTH_RADIUS_M = 6_371_000;

export interface RouteGeometry {
  /** GeoJSON order: [longitude, latitude]. */
  coordinates: [number, number][];
  distanceKm: number;
}

interface Planar {
  x: number;
  y: number;
}

/** Metres on a flat plane around `origin`; accurate enough across one ride. */
const projector = (origin: LatLng) => {
  const toRad = Math.PI / 180;
  const lngScale = Math.cos(origin.lat * toRad) * EARTH_RADIUS_M * toRad;
  const latScale = EARTH_RADIUS_M * toRad;
  return (point: LatLng): Planar => ({
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * latScale,
  });
};

const distanceToSegment = (p: Planar, a: Planar, b: Planar): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Douglas–Peucker, with an explicit stack: a long ride would overflow recursion. */
const simplify = (points: readonly Planar[], toleranceM: number): number[] => {
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = toleranceM;

    for (let i = first + 1; i < last; i += 1) {
      const distance = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }

    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  return keep.flatMap((isKept, index) => (isKept ? [index] : []));
};

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

export const routeFromTrack = (samples: readonly TrackSample[]): RouteGeometry | null => {
  const points = cleanTrack(samples);
  if (points.length < 2) return null;

  const distanceM = points.reduce(
    (total, point, index) => (index === 0 ? total : total + haversineMeters(points[index - 1]!, point)),
    0,
  );
  if (distanceM < MIN_ROUTE_DISTANCE_M) return null;

  const candidates = thinForSimplify(points);
  const planar = candidates.map(projector(candidates[0]!));
  let tolerance = INITIAL_TOLERANCE_M;
  let kept = simplify(planar, tolerance);
  while (kept.length > MAX_ROUTE_POINTS) {
    tolerance *= TOLERANCE_GROWTH;
    kept = simplify(planar, tolerance);
  }

  return {
    coordinates: kept.map((index) => [candidates[index]!.lng, candidates[index]!.lat]),
    distanceKm: Math.round(distanceM / 10) / 100,
  };
};
