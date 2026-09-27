/**
 * Douglas–Peucker line simplification with a point budget: keeps the points
 * that give a line its shape (its bends) and drops the ones that lie on the
 * straight stretch between them.
 */
import type { LatLng } from "../../utils/polyline.js";

const EARTH_RADIUS_M = 6_371_000;
const TOLERANCE_GROWTH = 1.5;

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

interface Span {
  first: number;
  last: number;
  farthest: number;
  distance: number;
}

const toSpan = (points: readonly Planar[], first: number, last: number): Span => {
  let farthest = -1;
  let distance = 0;
  for (let i = first + 1; i < last; i += 1) {
    const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
    if (d > distance) {
      farthest = i;
      distance = d;
    }
  }
  return { first, last, farthest, distance };
};

/**
 * Indexes of the `count` points that most shape the line, in line order, ends
 * excluded: each is the point furthest off the straight line between the
 * points already chosen, biggest first. Bends shallower than `minBendM` are
 * never chosen, so a straight line yields none.
 *
 * Unlike growing a tolerance, this cannot jump from too many points to none
 * when every bend is the same size.
 */
export const mostSignificantPoints = (
  points: readonly LatLng[],
  count: number,
  minBendM: number,
): number[] => {
  if (points.length <= 2 || count <= 0) return [];

  const planar = points.map(projector(points[0]!));
  const spans: Span[] = [toSpan(planar, 0, planar.length - 1)];
  const chosen: number[] = [];

  while (chosen.length < count) {
    const widest = spans.reduce((best, span) => (span.distance > best.distance ? span : best));
    if (widest.farthest === -1 || widest.distance < minBendM) break;

    chosen.push(widest.farthest);
    spans.splice(
      spans.indexOf(widest),
      1,
      toSpan(planar, widest.first, widest.farthest),
      toSpan(planar, widest.farthest, widest.last),
    );
  }

  return chosen.sort((a, b) => a - b);
};

/**
 * Indexes of the points to keep, ends always included, at most `maxPoints` of
 * them. The tolerance starts at `initialToleranceM` and grows until the line
 * fits the budget, so the bends that matter most are the last to go.
 */
export const simplifyToAtMost = (
  points: readonly LatLng[],
  maxPoints: number,
  initialToleranceM: number,
): number[] => {
  if (points.length <= 2) return points.map((_, index) => index);

  const planar = points.map(projector(points[0]!));
  let tolerance = initialToleranceM;
  let kept = simplify(planar, tolerance);
  while (kept.length > maxPoints) {
    tolerance *= TOLERANCE_GROWTH;
    kept = simplify(planar, tolerance);
  }
  return kept;
};
