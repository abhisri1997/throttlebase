/**
 * Encoded-polyline handling and along-route geometry.
 *
 * `decodePolyline` / `encodePolyline` implement Google's Encoded Polyline
 * Algorithm Format at precision 5. The client keeps its own copy of the decoder
 * in client/src/features/navigation/services/navigationRouteService.ts — the two
 * are deliberately duplicated (this repo has no shared package), so a fix in one
 * belongs in the other.
 *
 * Coordinates use the server's {lat, lng} convention, matching utils/geo.ts.
 * Note the client uses {latitude, longitude} and the API wire format uses
 * [lng, lat] tuples; convert at the boundary, not in here.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Google's encoded-polyline precision: 5 decimal places. */
const PRECISION_FACTOR = 1e5;
const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_DEGREE_LATITUDE = 111111;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const decodePolyline = (encoded: string): LatLng[] => {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / PRECISION_FACTOR, lng: lng / PRECISION_FACTOR });
  }

  return points;
};

const encodeSignedValue = (value: number): string => {
  let remaining = value < 0 ? ~(value << 1) : value << 1;
  let output = "";

  while (remaining >= 0x20) {
    output += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }

  return output + String.fromCharCode(remaining + 63);
};

export const encodePolyline = (points: LatLng[]): string => {
  let previousLat = 0;
  let previousLng = 0;
  let output = "";

  for (const point of points) {
    // Round rather than truncate, and accumulate deltas in scaled integer
    // space: truncation error compounds across every subsequent point and
    // visibly drifts the tail of a long route.
    const lat = Math.round(point.lat * PRECISION_FACTOR);
    const lng = Math.round(point.lng * PRECISION_FACTOR);

    output += encodeSignedValue(lat - previousLat);
    output += encodeSignedValue(lng - previousLng);

    previousLat = lat;
    previousLng = lng;
  }

  return output;
};

export const haversineMeters = (from: LatLng, to: LatLng): number => {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Local flat-earth projection in metres, relative to `origin`. Accurate enough
 * over a single polyline segment and far cheaper than repeated haversine.
 */
const toLocalMeters = (
  point: LatLng,
  origin: LatLng,
): { x: number; y: number } => ({
  x:
    (point.lng - origin.lng) *
    METERS_PER_DEGREE_LATITUDE *
    Math.cos(toRad(origin.lat)),
  y: (point.lat - origin.lat) * METERS_PER_DEGREE_LATITUDE,
});

/**
 * Distance in metres from the first vertex to each vertex. Index i holds the
 * distance travelled to reach polyline[i], so the last entry is total length.
 */
export const cumulativeDistances = (polyline: LatLng[]): number[] => {
  const distances: number[] = new Array(polyline.length).fill(0);

  for (let i = 1; i < polyline.length; i++) {
    distances[i] = distances[i - 1]! + haversineMeters(polyline[i - 1]!, polyline[i]!);
  }

  return distances;
};

export interface PolylineProjection {
  /** Metres travelled along the route to the closest point on it. */
  distanceAlongMeters: number;
  /** Perpendicular metres between the point and the route. */
  offsetMeters: number;
}

/**
 * Projects a point onto a polyline, returning how far along the route the
 * closest point falls and how far off the route the point sits.
 *
 * Pass a precomputed `cumulative` when projecting many points onto one route —
 * recomputing it per point is the difference between one pass and N passes.
 */
export const projectOntoPolyline = (
  point: LatLng,
  polyline: LatLng[],
  cumulative: number[] = cumulativeDistances(polyline),
): PolylineProjection => {
  if (polyline.length === 0) {
    return { distanceAlongMeters: 0, offsetMeters: Number.POSITIVE_INFINITY };
  }

  if (polyline.length === 1) {
    return {
      distanceAlongMeters: 0,
      offsetMeters: haversineMeters(point, polyline[0]!),
    };
  }

  let best: PolylineProjection = {
    distanceAlongMeters: 0,
    offsetMeters: Number.POSITIVE_INFINITY,
  };

  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i]!;
    const end = polyline[i + 1]!;

    const segment = toLocalMeters(end, start);
    const relative = toLocalMeters(point, start);
    const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;

    let ratio = 0;
    let offsetMeters: number;

    if (segmentLengthSquared <= 0) {
      offsetMeters = haversineMeters(point, start);
    } else {
      ratio = clamp(
        (relative.x * segment.x + relative.y * segment.y) / segmentLengthSquared,
        0,
        1,
      );
      offsetMeters = Math.hypot(
        relative.x - segment.x * ratio,
        relative.y - segment.y * ratio,
      );
    }

    if (offsetMeters < best.offsetMeters) {
      const segmentLength = cumulative[i + 1]! - cumulative[i]!;
      best = {
        distanceAlongMeters: cumulative[i]! + segmentLength * ratio,
        offsetMeters,
      };
    }
  }

  return best;
};
