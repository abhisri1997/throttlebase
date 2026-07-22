import type { LatLng, NavigationRoute, NavigationStep } from "../types/navigation";

const ROUTE_CACHE_TTL_MS = 15000;
export const DEFAULT_ROUTE_DEVIATION_THRESHOLD_METERS = 60;
export const DEFAULT_ROUTE_DEVIATION_GRACE_MS = 15000;
export const DEFAULT_ROUTE_REROUTE_COOLDOWN_MS = 25000;
export const DEFAULT_ROUTE_MIN_MOVEMENT_METERS = 40;

const routeCache = new Map<
  string,
  { route: NavigationRoute; cachedAt: number }
>();

const inFlightRouteRequests = new Map<string, Promise<NavigationRoute>>();

const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toRad = (value: number): number => (value * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const pointsEqual = (left: LatLng, right: LatLng): boolean => {
  const tolerance = 0.00001;
  return (
    Math.abs(left.latitude - right.latitude) <= tolerance &&
    Math.abs(left.longitude - right.longitude) <= tolerance
  );
};

const serializePoint = (point: LatLng): string =>
  `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

const buildRouteRequestKey = (input: {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  apiKey?: string;
  preferFastest?: boolean;
}): string =>
  [
    serializePoint(input.origin),
    ...(input.waypoints || []).map(serializePoint),
    serializePoint(input.destination),
    input.apiKey ? "directions" : "fallback",
    input.preferFastest === false ? "first-route" : "fastest-route",
  ].join("|");

const getCachedRoute = (key: string): NavigationRoute | null => {
  const cached = routeCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }

  return cached.route;
};

const setCachedRoute = (key: string, route: NavigationRoute): NavigationRoute => {
  routeCache.set(key, { route, cachedAt: Date.now() });
  return route;
};

const bearingDegrees = (from: LatLng, to: LatLng): number => {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
};

const metersPerDegreeLatitude = 111111;

const toLocalMeters = (point: LatLng, origin: LatLng): { x: number; y: number } => ({
  x:
    (point.longitude - origin.longitude) *
    metersPerDegreeLatitude *
    Math.cos(toRad(origin.latitude)),
  y: (point.latitude - origin.latitude) * metersPerDegreeLatitude,
});

const distanceToSegmentMeters = (
  point: LatLng,
  start: LatLng,
  end: LatLng,
): number => {
  const segment = toLocalMeters(end, start);
  const relative = toLocalMeters(point, start);
  const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;

  if (segmentLengthSquared <= 0) {
    return haversineMeters(point, start);
  }

  const t = clamp(
    (relative.x * segment.x + relative.y * segment.y) / segmentLengthSquared,
    0,
    1,
  );

  const closest = {
    x: segment.x * t,
    y: segment.y * t,
  };

  return Math.hypot(relative.x - closest.x, relative.y - closest.y);
};

export const distanceToPolylineMeters = (
  point: LatLng,
  polyline: LatLng[],
): number => {
  if (polyline.length === 0) {
    return Infinity;
  }

  if (polyline.length === 1) {
    return haversineMeters(point, polyline[0]);
  }

  let bestDistance = Infinity;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const distance = distanceToSegmentMeters(point, polyline[index], polyline[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }

  return bestDistance;
};

export const isRouteDeviation = (
  point: LatLng,
  polyline: LatLng[],
  thresholdMeters = DEFAULT_ROUTE_DEVIATION_THRESHOLD_METERS,
): boolean => distanceToPolylineMeters(point, polyline) >= thresholdMeters;

export const getRouteProgressIndex = (
  point: LatLng,
  polyline: LatLng[],
): number => {
  if (polyline.length <= 1) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;

  for (let index = 0; index < polyline.length; index += 1) {
    const distance = haversineMeters(point, polyline[index]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
};

const angleDeltaDegrees = (left: number, right: number): number => {
  let delta = Math.abs(left - right);
  if (delta > 180) {
    delta = 360 - delta;
  }
  return delta;
};

const thinByDistanceAndTurns = (
  points: LatLng[],
  minDistMeters: number,
  turnThresholdDeg: number,
): LatLng[] => {
  if (points.length <= 2) {
    return points;
  }

  const result: LatLng[] = [points[0]];
  let lastBearing: number | null = null;

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const lastKept = result[result.length - 1];
    const toCurrent = haversineMeters(lastKept, current);
    const next = points[i + 1];

    const incomingBearing = bearingDegrees(lastKept, current);
    const outgoingBearing = bearingDegrees(current, next);
    const turningNow =
      Number.isFinite(incomingBearing) &&
      Number.isFinite(outgoingBearing) &&
      angleDeltaDegrees(incomingBearing, outgoingBearing) >= turnThresholdDeg;

    if (toCurrent >= minDistMeters || turningNow) {
      result.push(current);
      lastBearing = outgoingBearing;
      continue;
    }

    if (lastBearing != null && Number.isFinite(incomingBearing)) {
      const drift = angleDeltaDegrees(lastBearing, incomingBearing);
      if (drift >= turnThresholdDeg) {
        result.push(current);
        lastBearing = outgoingBearing;
      }
    }
  }

  result.push(points[points.length - 1]);
  return result;
};

// Road-safe simplification:
// 1) keep points by minimum distance
// 2) always preserve turns above threshold
// 3) iteratively raise distance threshold until point budget is met
export const simplifyPolyline = (
  points: LatLng[],
  minDistMeters = 12,
  maxPoints = 1400,
): LatLng[] => {
  if (points.length <= 2) {
    return points;
  }

  const dynamicStartDist =
    points.length > 10000
      ? Math.max(minDistMeters, 16)
      : points.length > 7000
        ? Math.max(minDistMeters, 14)
        : minDistMeters;

  let workingDist = dynamicStartDist;
  let turnThreshold = 16;
  let simplified = thinByDistanceAndTurns(points, workingDist, turnThreshold);

  while (simplified.length > maxPoints && workingDist <= 80) {
    workingDist *= 1.2;
    turnThreshold = Math.max(12, turnThreshold - 1);
    simplified = thinByDistanceAndTurns(points, workingDist, turnThreshold);
  }

  return simplified;
};

export const dedupeConsecutivePoints = (points: LatLng[]): LatLng[] => {
  if (points.length <= 1) {
    return points;
  }

  const deduped: LatLng[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = deduped[deduped.length - 1];
    if (!pointsEqual(point, previous)) {
      deduped.push(point);
    }
  }

  return deduped;
};

export type CanonicalRideRouteInput = {
  origin: LatLng;
  destination: LatLng;
  waypoints: LatLng[];
  orderedPoints: LatLng[];
};

export const buildCanonicalRideRouteInput = (input: {
  origin?: LatLng | null;
  start?: LatLng | null;
  stops?: LatLng[];
  destination?: LatLng | null;
}): CanonicalRideRouteInput | null => {
  const effectiveOrigin = input.origin || input.start || null;
  const chain = [
    effectiveOrigin,
    input.start || null,
    ...(input.stops || []),
    input.destination || null,
  ].filter((point): point is LatLng => Boolean(point));

  const orderedPoints = dedupeConsecutivePoints(chain);
  if (orderedPoints.length < 2) {
    return null;
  }

  return {
    origin: orderedPoints[0],
    destination: orderedPoints[orderedPoints.length - 1],
    waypoints: orderedPoints.slice(1, -1),
    orderedPoints,
  };
};

export const haversineMeters = (from: LatLng, to: LatLng): number => {
  const earthRadiusMeters = 6371000;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) *
    Math.cos(toRad(to.latitude)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const decodePolyline = (encoded: string): LatLng[] => {
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

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    latitude += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLon = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    longitude += deltaLon;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
};

const buildFallbackRoute = (points: LatLng[]): NavigationRoute => {
  const steps: NavigationStep[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const distanceMeters = haversineMeters(start, end);

    steps.push({
      instruction: i === points.length - 2 ? "Arrive at destination" : "Continue on route",
      distanceMeters,
      durationSeconds: Math.max(30, Math.round((distanceMeters / 1000 / 28) * 3600)),
      start,
      end,
    });
  }

  return {
    source: "fallback",
    polyline: points,
    steps,
    totalDistanceMeters: steps.reduce((sum, step) => sum + step.distanceMeters, 0),
    totalDurationSeconds: steps.reduce((sum, step) => sum + step.durationSeconds, 0),
    estimatedTrafficDurationSeconds: steps.reduce((sum, step) => sum + step.durationSeconds, 0),
    selectedAlternativeIndex: 0,
    alternativeCount: 1,
  };
};

type DirectionsLeg = {
  distance?: { value: number };
  duration?: { value: number };
  duration_in_traffic?: { value: number };
  steps?: Array<{
    html_instructions?: string;
    distance?: { value: number };
    duration?: { value: number };
    start_location?: { lat: number; lng: number };
    end_location?: { lat: number; lng: number };
    polyline?: { points: string };
    maneuver?: string;
  }>;
};

type DirectionsResponse = {
  status: string;
  routes?: Array<{
    overview_polyline?: { points: string };
    legs?: DirectionsLeg[];
  }>;
};

const buildDirectionsRoute = (
  route: NonNullable<DirectionsResponse["routes"]>[number],
  routeIndex: number,
  fallbackPoints: LatLng[],
): NavigationRoute | null => {
  const stepPolylinePoints: LatLng[] = [];

  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      if (step.polyline?.points) {
        stepPolylinePoints.push(...decodePolyline(step.polyline.points));
      }
    }
  }

  const rawDecoded =
    stepPolylinePoints.length >= 2
      ? stepPolylinePoints
      : route.overview_polyline?.points
        ? decodePolyline(route.overview_polyline.points)
        : fallbackPoints;

  const decoded = simplifyPolyline(rawDecoded);

  if (__DEV__) {
    console.log(
      "[navigation-route] route",
      routeIndex,
      "raw pts:",
      rawDecoded.length,
      "simplified pts:",
      decoded.length,
    );
  }

  const steps: NavigationStep[] = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const start = step.start_location
        ? { latitude: step.start_location.lat, longitude: step.start_location.lng }
        : null;
      const end = step.end_location
        ? { latitude: step.end_location.lat, longitude: step.end_location.lng }
        : null;

      if (!start || !end) {
        continue;
      }

      steps.push({
        instruction: stripHtml(step.html_instructions || "Continue"),
        distanceMeters: step.distance?.value ?? haversineMeters(start, end),
        durationSeconds: step.duration?.value ?? 30,
        start,
        end,
        maneuver: step.maneuver,
      });
    }
  }

  if (steps.length === 0) {
    return decoded.length > 1 ? buildFallbackRoute(decoded) : null;
  }

  const totalDistanceMeters = (route.legs || []).reduce(
    (sum, leg) => sum + (leg.distance?.value || 0),
    0,
  );
  const totalDurationSeconds = (route.legs || []).reduce(
    (sum, leg) => sum + (leg.duration?.value || 0),
    0,
  );
  const estimatedTrafficDurationSeconds = (route.legs || []).reduce(
    (sum, leg) => sum + (leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0),
    0,
  );

  return {
    source: "directions",
    polyline: decoded,
    steps,
    totalDistanceMeters,
    totalDurationSeconds,
    estimatedTrafficDurationSeconds,
    selectedAlternativeIndex: routeIndex,
    alternativeCount: 1,
  };
};

const selectFastestRoute = (routes: NavigationRoute[]): NavigationRoute | null => {
  if (routes.length === 0) {
    return null;
  }

  return [...routes].sort((left, right) => {
    const leftTime = left.estimatedTrafficDurationSeconds ?? left.totalDurationSeconds;
    const rightTime = right.estimatedTrafficDurationSeconds ?? right.totalDurationSeconds;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.totalDistanceMeters - right.totalDistanceMeters;
  })[0];
};

export const fetchNavigationRoute = async (input: {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  apiKey?: string;
  preferFastest?: boolean;
}): Promise<NavigationRoute> => {
  const requestKey = buildRouteRequestKey(input);
  const cachedRoute = getCachedRoute(requestKey);
  if (cachedRoute) {
    return cachedRoute;
  }

  const existingRequest = inFlightRouteRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = (async (): Promise<NavigationRoute> => {
    const fallbackPoints = dedupeConsecutivePoints([
      input.origin,
      ...(input.waypoints || []),
      input.destination,
    ]);

    if (!input.apiKey) {
      return setCachedRoute(requestKey, buildFallbackRoute(fallbackPoints));
    }

    const origin = `${input.origin.latitude},${input.origin.longitude}`;
    const destination = `${input.destination.latitude},${input.destination.longitude}`;
    const waypointParam = (input.waypoints || [])
      .map((point) => `${point.latitude},${point.longitude}`)
      .join("|");

    const params = new URLSearchParams({
      origin,
      destination,
      mode: "driving",
      departure_time: "now",
      key: input.apiKey,
    });

    if (waypointParam) {
      params.set("waypoints", waypointParam);
    }

    if (input.preferFastest !== false) {
      params.set("alternatives", "true");
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
    );

    const payload = (await response.json()) as DirectionsResponse;

    if (!response.ok || payload.status !== "OK" || !payload.routes?.length) {
      return setCachedRoute(requestKey, buildFallbackRoute(fallbackPoints));
    }

    const candidates = payload.routes
      .map((route, index) => buildDirectionsRoute(route, index, fallbackPoints))
      .filter((route): route is NavigationRoute => Boolean(route));

    const selectedRoute =
      input.preferFastest === false
        ? candidates[0]
        : selectFastestRoute(candidates) ?? candidates[0];

    if (!selectedRoute) {
      return setCachedRoute(requestKey, buildFallbackRoute(fallbackPoints));
    }

    return setCachedRoute(requestKey, {
      ...selectedRoute,
      alternativeCount: candidates.length,
    });
  })();

  inFlightRouteRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRouteRequests.delete(requestKey);
  }
};
