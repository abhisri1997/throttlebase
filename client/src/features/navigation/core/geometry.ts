/**
 * Pure navigation geometry: distances, bearings, polyline decoding, and
 * projecting a position onto a route.
 *
 * No React Native imports, so it runs under `tsx --test`. The cumulative
 * distance and projection maths are ported from server/src/utils/polyline.ts,
 * which is tested there; a fix in one belongs in the other.
 */
import type { LatLng } from "../types/navigation";

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_DEGREE_LATITUDE = 111111;
/** Google's encoded-polyline precision: 5 decimal places. */
const POLYLINE_PRECISION_FACTOR = 1e5;
const DEFAULT_HEADING_TOLERANCE_DEGREES = 90;

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const haversineMeters = (from: LatLng, to: LatLng): number => {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Initial bearing from `from` to `to`, in degrees clockwise from north (0–360). */
export const bearingDegrees = (from: LatLng, to: LatLng): number => {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/** Smallest angle between two bearings, 0–180. */
export const angleDeltaDegrees = (left: number, right: number): number => {
  const delta = Math.abs(left - right) % 360;
  return delta > 180 ? 360 - delta : delta;
};

export const decodePolyline = (encoded: string): LatLng[] => {
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    points.push({
      latitude: latitude / POLYLINE_PRECISION_FACTOR,
      longitude: longitude / POLYLINE_PRECISION_FACTOR,
    });
  }

  return points;
};

/**
 * Flat-earth projection in metres relative to `origin`. Accurate over a single
 * polyline segment and far cheaper than repeated haversine.
 */
const toLocalMeters = (
  point: LatLng,
  origin: LatLng,
): { x: number; y: number } => ({
  x:
    (point.longitude - origin.longitude) *
    METERS_PER_DEGREE_LATITUDE *
    Math.cos(toRadians(origin.latitude)),
  y: (point.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
});

/**
 * Distance in metres from the first vertex to each vertex. Index i holds the
 * distance travelled to reach polyline[i]; the last entry is the total length.
 */
export const cumulativeDistances = (polyline: readonly LatLng[]): number[] => {
  const distances = new Array<number>(polyline.length).fill(0);

  for (let i = 1; i < polyline.length; i += 1) {
    distances[i] =
      (distances[i - 1] ?? 0) + haversineMeters(polyline[i - 1]!, polyline[i]!);
  }

  return distances;
};

export interface PolylineProjection {
  /** Metres along the polyline to the projected point. */
  distanceAlongMeters: number;
  /** Metres between the position and the polyline. */
  offsetMeters: number;
  /** Segment (polyline[i] → polyline[i + 1]) that holds the projected point. */
  segmentIndex: number;
  /** The projected point itself, on the polyline. */
  point: LatLng;
}

export interface ProjectionOptions {
  /** Only consider the stretch of route from here… */
  minAlongMeters?: number;
  /** …to here. */
  maxAlongMeters?: number;
  /**
   * Direction of travel. Segments pointing more than `headingToleranceDegrees`
   * away are ignored — that is what tells the two passes of an out-and-back
   * road apart. Dropped if it would exclude every segment.
   */
  headingDegrees?: number | null;
  headingToleranceDegrees?: number;
  /**
   * When several segments are about equally close, take the one earliest along
   * the route instead of the strictly nearest. For places where "the first time
   * the route passes here" is the right answer.
   */
  preferEarliestWithinMeters?: number;
}

const collectCandidates = (
  point: LatLng,
  polyline: readonly LatLng[],
  cumulative: readonly number[],
  minAlong: number,
  maxAlong: number,
  heading: number | null,
  headingTolerance: number,
): PolylineProjection[] => {
  const candidates: PolylineProjection[] = [];

  for (let i = 0; i < polyline.length - 1; i += 1) {
    const segmentStartAlong = cumulative[i] ?? 0;
    const segmentEndAlong = cumulative[i + 1] ?? segmentStartAlong;

    if (segmentEndAlong < minAlong || segmentStartAlong > maxAlong) continue;

    const start = polyline[i]!;
    const end = polyline[i + 1]!;
    const segment = toLocalMeters(end, start);
    const relative = toLocalMeters(point, start);
    const lengthSquared = segment.x * segment.x + segment.y * segment.y;

    if (
      heading !== null &&
      lengthSquared > 0 &&
      angleDeltaDegrees(bearingDegrees(start, end), heading) > headingTolerance
    ) {
      continue;
    }

    const segmentLength = segmentEndAlong - segmentStartAlong;
    let ratio =
      lengthSquared > 0
        ? clamp(
            (relative.x * segment.x + relative.y * segment.y) / lengthSquared,
            0,
            1,
          )
        : 0;

    // Keep the projected point inside the requested window.
    if (segmentLength > 0) {
      const along = clamp(segmentStartAlong + segmentLength * ratio, minAlong, maxAlong);
      ratio = clamp((along - segmentStartAlong) / segmentLength, 0, 1);
    }

    candidates.push({
      distanceAlongMeters: segmentStartAlong + segmentLength * ratio,
      offsetMeters: Math.hypot(
        relative.x - segment.x * ratio,
        relative.y - segment.y * ratio,
      ),
      segmentIndex: i,
      point: {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      },
    });
  }

  return candidates;
};

/**
 * Projects a position onto a polyline. Returns null only when the polyline is
 * empty or no segment falls inside the requested window.
 *
 * Pass a precomputed `cumulative` when projecting repeatedly onto one route —
 * recomputing it per call turns one pass into N.
 */
export const projectOntoPolyline = (
  point: LatLng,
  polyline: readonly LatLng[],
  cumulative: readonly number[] = cumulativeDistances(polyline),
  options: ProjectionOptions = {},
): PolylineProjection | null => {
  if (polyline.length === 0) return null;

  if (polyline.length === 1) {
    return {
      distanceAlongMeters: 0,
      offsetMeters: haversineMeters(point, polyline[0]!),
      segmentIndex: 0,
      point: polyline[0]!,
    };
  }

  const minAlong = options.minAlongMeters ?? Number.NEGATIVE_INFINITY;
  const maxAlong = options.maxAlongMeters ?? Number.POSITIVE_INFINITY;
  const tolerance = options.headingToleranceDegrees ?? DEFAULT_HEADING_TOLERANCE_DEGREES;
  const heading =
    typeof options.headingDegrees === "number" && Number.isFinite(options.headingDegrees)
      ? options.headingDegrees
      : null;

  let candidates = collectCandidates(
    point,
    polyline,
    cumulative,
    minAlong,
    maxAlong,
    heading,
    tolerance,
  );

  if (candidates.length === 0 && heading !== null) {
    candidates = collectCandidates(
      point,
      polyline,
      cumulative,
      minAlong,
      maxAlong,
      null,
      tolerance,
    );
  }

  if (candidates.length === 0) return null;

  const nearest = candidates.reduce((best, candidate) =>
    candidate.offsetMeters < best.offsetMeters ? candidate : best,
  );

  if (options.preferEarliestWithinMeters === undefined) return nearest;

  const acceptableOffset = nearest.offsetMeters + options.preferEarliestWithinMeters;
  return candidates
    .filter((candidate) => candidate.offsetMeters <= acceptableOffset)
    .reduce((earliest, candidate) =>
      candidate.distanceAlongMeters < earliest.distanceAlongMeters ? candidate : earliest,
    );
};

/** The part of a polyline ahead of a projection, starting exactly at the projected point. */
export const polylineAhead = (
  polyline: readonly LatLng[],
  projection: PolylineProjection,
): LatLng[] => [projection.point, ...polyline.slice(projection.segmentIndex + 1)];
