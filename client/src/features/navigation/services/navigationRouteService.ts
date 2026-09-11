import type {
  LatLng,
  NavigationRoute,
  NavigationStep,
  RouteLeg,
} from "../types/navigation";
import {
  angleDeltaDegrees,
  bearingDegrees,
  decodePolyline,
  haversineMeters,
  projectOntoPolyline,
} from "../core/geometry";
import { parseInstructionHtml } from "../core/instructionText";

// Existing callers import this from here; the implementation lives in core/geometry.
export { haversineMeters };

const ROUTE_CACHE_TTL_MS = 15000;
const ROUTE_CACHE_MAX_ENTRIES = 50;
/**
 * Point budget per leg after simplification. Legs are simplified one at a time
 * so their boundaries — the stops — survive by construction.
 */
const LEG_MAX_POINTS = 700;
const LEG_MIN_POINT_SPACING_METERS = 12;
/** Average speed assumed for straight-line fallback legs when Directions is unavailable. */
const FALLBACK_SPEED_KMH = 28;
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

export const DEFAULT_ROUTE_DEVIATION_THRESHOLD_METERS = 60;
export const DEFAULT_ROUTE_DEVIATION_GRACE_MS = 15000;
export const DEFAULT_ROUTE_REROUTE_COOLDOWN_MS = 25000;

const routeCache = new Map<string, { route: NavigationRoute; cachedAt: number }>();
const inFlightRouteRequests = new Map<string, Promise<NavigationRoute>>();
let directionsRequestCount = 0;

/**
 * Directions requests actually sent this session. Every one is billed, so this
 * is how fetch frequency is verified during development.
 */
export const getDirectionsRequestCount = (): number => directionsRequestCount;

interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  /** Stopovers. Each one adds a leg to the result. */
  waypoints?: LatLng[];
  apiKey?: string;
  /** Pick the fastest of Google's alternatives. Only possible without stopovers. */
  preferFastest?: boolean;
  /**
   * Ask for traffic-aware durations. Google bills this at the Directions
   * Advanced rate and only returns traffic for requests without stopovers, so
   * it is off unless a caller needs a live ETA.
   */
  trafficAware?: boolean;
}

const pointsEqual = (left: LatLng, right: LatLng): boolean => {
  const tolerance = 0.00001;
  return (
    Math.abs(left.latitude - right.latitude) <= tolerance &&
    Math.abs(left.longitude - right.longitude) <= tolerance
  );
};

const serializePoint = (point: LatLng): string =>
  `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

const toRequestParam = (point: LatLng): string => `${point.latitude},${point.longitude}`;

const buildRouteRequestKey = (input: RouteRequest): string =>
  [
    serializePoint(input.origin),
    ...(input.waypoints || []).map(serializePoint),
    serializePoint(input.destination),
    input.apiKey ? "directions" : "fallback",
    input.preferFastest === false ? "first-route" : "fastest-route",
    input.trafficAware ? "traffic" : "no-traffic",
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
  // Live navigation keys on a moving GPS origin, so entries rarely repeat. Sweep
  // before the map can grow for the length of a ride.
  if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [cachedKey, entry] of routeCache) {
      if (now - entry.cachedAt > ROUTE_CACHE_TTL_MS) {
        routeCache.delete(cachedKey);
      }
    }

    if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) {
      const oldestKey = routeCache.keys().next().value;
      if (oldestKey !== undefined) {
        routeCache.delete(oldestKey);
      }
    }
  }

  routeCache.set(key, { route, cachedAt: Date.now() });
  return route;
};

export const distanceToPolylineMeters = (point: LatLng, polyline: LatLng[]): number =>
  projectOntoPolyline(point, polyline)?.offsetMeters ?? Infinity;

export const isRouteDeviation = (
  point: LatLng,
  polyline: LatLng[],
  thresholdMeters = DEFAULT_ROUTE_DEVIATION_THRESHOLD_METERS,
): boolean => distanceToPolylineMeters(point, polyline) >= thresholdMeters;

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

const sumBy = <T,>(items: readonly T[], pick: (item: T) => number): number =>
  items.reduce((sum, item) => sum + pick(item), 0);

/** Straight lines between the requested points, one leg per pair. Used when Directions is unavailable. */
const buildFallbackRoute = (points: readonly LatLng[], errorStatus?: string): NavigationRoute => {
  const legs: RouteLeg[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const distanceMeters = haversineMeters(start, end);
    const durationSeconds = Math.max(
      30,
      Math.round((distanceMeters / 1000 / FALLBACK_SPEED_KMH) * 3600),
    );

    legs.push({
      index: i,
      start,
      end,
      polyline: [start, end],
      steps: [
        {
          instruction:
            i === points.length - 2 ? "Arrive at destination" : "Continue to the next stop",
          distanceMeters,
          durationSeconds,
          start,
          end,
          legIndex: i,
        },
      ],
      distanceMeters,
      durationSeconds,
    });
  }

  const totalDurationSeconds = sumBy(legs, (leg) => leg.durationSeconds);

  return {
    source: "fallback",
    ...(errorStatus ? { errorStatus } : {}),
    legs,
    polyline: [...points],
    steps: legs.flatMap((leg) => leg.steps),
    totalDistanceMeters: sumBy(legs, (leg) => leg.distanceMeters),
    totalDurationSeconds,
    estimatedTrafficDurationSeconds: totalDurationSeconds,
    selectedAlternativeIndex: 0,
    alternativeCount: 1,
  };
};

type DirectionsLocation = { lat: number; lng: number };

type DirectionsLeg = {
  start_location?: DirectionsLocation;
  end_location?: DirectionsLocation;
  distance?: { value: number };
  duration?: { value: number };
  duration_in_traffic?: { value: number };
  steps?: Array<{
    html_instructions?: string;
    distance?: { value: number };
    duration?: { value: number };
    start_location?: DirectionsLocation;
    end_location?: DirectionsLocation;
    polyline?: { points: string };
    maneuver?: string;
  }>;
};

type DirectionsResponse = {
  status: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: { points: string };
    legs?: DirectionsLeg[];
  }>;
};

const toLatLng = (location?: DirectionsLocation): LatLng | null =>
  location ? { latitude: location.lat, longitude: location.lng } : null;

const buildLeg = (
  leg: DirectionsLeg,
  legIndex: number,
  fallbackStart: LatLng,
  fallbackEnd: LatLng,
): RouteLeg => {
  const rawPoints: LatLng[] = [];
  const steps: NavigationStep[] = [];

  for (const step of leg.steps || []) {
    if (step.polyline?.points) {
      rawPoints.push(...decodePolyline(step.polyline.points));
    }

    const start = toLatLng(step.start_location);
    const end = toLatLng(step.end_location);
    if (!start || !end) {
      continue;
    }

    const parsed = parseInstructionHtml(step.html_instructions);
    steps.push({
      instruction: parsed.primary,
      roadName: parsed.roadName,
      note: parsed.note,
      distanceMeters: step.distance?.value ?? haversineMeters(start, end),
      durationSeconds: step.duration?.value ?? 30,
      start,
      end,
      maneuver: step.maneuver,
      legIndex,
    });
  }

  const legStart = toLatLng(leg.start_location) ?? steps[0]?.start ?? fallbackStart;
  const legEnd = toLatLng(leg.end_location) ?? steps[steps.length - 1]?.end ?? fallbackEnd;

  // Consecutive step polylines share their joint point. Deduping first stops
  // the duplicate reading as a zero-length "turn" that thinning would keep.
  const points = dedupeConsecutivePoints(rawPoints.length >= 2 ? rawPoints : [legStart, legEnd]);

  return {
    index: legIndex,
    start: legStart,
    end: legEnd,
    polyline: simplifyPolyline(points, LEG_MIN_POINT_SPACING_METERS, LEG_MAX_POINTS),
    steps,
    distanceMeters: leg.distance?.value ?? sumBy(steps, (step) => step.distanceMeters),
    durationSeconds: leg.duration?.value ?? sumBy(steps, (step) => step.durationSeconds),
    ...(leg.duration_in_traffic
      ? { durationInTrafficSeconds: leg.duration_in_traffic.value }
      : {}),
  };
};

const buildDirectionsRoute = (
  route: NonNullable<DirectionsResponse["routes"]>[number],
  routeIndex: number,
  requestPoints: readonly LatLng[],
): NavigationRoute | null => {
  const firstPoint = requestPoints[0];
  const lastPoint = requestPoints[requestPoints.length - 1];

  const legs = (route.legs || []).map((leg, index) =>
    buildLeg(
      leg,
      index,
      requestPoints[index] ?? firstPoint,
      requestPoints[index + 1] ?? lastPoint,
    ),
  );
  const steps = legs.flatMap((leg) => leg.steps);

  if (legs.length === 0 || steps.length === 0) {
    return null;
  }

  const hasTraffic = legs.every((leg) => leg.durationInTrafficSeconds !== undefined);

  return {
    source: "directions",
    legs,
    polyline: dedupeConsecutivePoints(legs.flatMap((leg) => leg.polyline)),
    // The overview polyline is already simplified by Google, which makes it the
    // right corridor for search-along-route — the per-step polylines used for
    // the legs are far denser than that needs.
    encodedPolyline: route.overview_polyline?.points,
    steps,
    totalDistanceMeters: sumBy(legs, (leg) => leg.distanceMeters),
    totalDurationSeconds: sumBy(legs, (leg) => leg.durationSeconds),
    ...(hasTraffic
      ? {
          estimatedTrafficDurationSeconds: sumBy(
            legs,
            (leg) => leg.durationInTrafficSeconds ?? leg.durationSeconds,
          ),
        }
      : {}),
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

/**
 * Fetches a route from Google Directions. Never rejects: any failure resolves
 * to a straight-line fallback whose `errorStatus` says why.
 */
export const fetchNavigationRoute = async (input: RouteRequest): Promise<NavigationRoute> => {
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
    const waypoints = input.waypoints || [];
    const requestPoints = dedupeConsecutivePoints([
      input.origin,
      ...waypoints,
      input.destination,
    ]);

    if (!input.apiKey) {
      return setCachedRoute(requestKey, buildFallbackRoute(requestPoints, "NO_API_KEY"));
    }

    const hasStopovers = waypoints.length > 0;
    const params = new URLSearchParams({
      origin: toRequestParam(input.origin),
      destination: toRequestParam(input.destination),
      mode: "driving",
      key: input.apiKey,
    });

    if (hasStopovers) {
      params.set("waypoints", waypoints.map(toRequestParam).join("|"));
    }

    // Google returns traffic and alternatives only for requests without
    // stopovers, yet still bills `departure_time` at the Directions Advanced
    // rate. Only ask where the answer can actually come back.
    if (!hasStopovers && input.trafficAware) {
      params.set("departure_time", "now");
    }

    if (!hasStopovers && input.preferFastest !== false) {
      params.set("alternatives", "true");
    }

    let payload: DirectionsResponse;
    try {
      directionsRequestCount += 1;
      if (__DEV__) {
        console.log(
          "[navigation-route] directions request",
          directionsRequestCount,
          hasStopovers ? `${waypoints.length} stopovers` : "direct",
          input.trafficAware && !hasStopovers ? "traffic" : "no traffic",
        );
      }

      const response = await fetch(`${DIRECTIONS_URL}?${params.toString()}`);
      if (!response.ok) {
        return setCachedRoute(
          requestKey,
          buildFallbackRoute(requestPoints, `HTTP_${response.status}`),
        );
      }

      payload = (await response.json()) as DirectionsResponse;
    } catch (error) {
      if (__DEV__) {
        console.warn("[navigation-route] directions request failed", error);
      }
      return setCachedRoute(requestKey, buildFallbackRoute(requestPoints, "NETWORK_ERROR"));
    }

    if (payload.status !== "OK" || !payload.routes?.length) {
      if (__DEV__) {
        console.warn(
          "[navigation-route] directions status",
          payload.status,
          payload.error_message ?? "",
        );
      }
      return setCachedRoute(
        requestKey,
        buildFallbackRoute(requestPoints, payload.status || "UNKNOWN_STATUS"),
      );
    }

    const candidates = payload.routes
      .map((route, index) => buildDirectionsRoute(route, index, requestPoints))
      .filter((route): route is NavigationRoute => Boolean(route));

    const selectedRoute =
      input.preferFastest === false
        ? candidates[0]
        : selectFastestRoute(candidates) ?? candidates[0];

    if (!selectedRoute) {
      return setCachedRoute(requestKey, buildFallbackRoute(requestPoints, "NO_STEPS"));
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

/**
 * The ride as planned — start → stops → destination, one leg per stop. Fetched
 * once per plan. No traffic: it would bill the Advanced rate, and Google
 * returns none for requests with stopovers anyway.
 */
export const fetchPlannedRideRoute = (
  points: readonly LatLng[],
  apiKey?: string,
): Promise<NavigationRoute> => {
  const origin = points[0];
  const destination = points[points.length - 1];

  if (points.length < 2 || !origin || !destination) {
    return Promise.reject(
      new Error("A planned route needs at least a start and a destination."),
    );
  }

  return fetchNavigationRoute({
    origin,
    destination,
    waypoints: points.slice(1, -1),
    apiKey,
    preferFastest: false,
    trafficAware: false,
  });
};

/**
 * The leg being ridden, from the rider's position to the next waypoint. No
 * stopovers, so traffic-aware ETA and the fastest of Google's alternatives both
 * actually work.
 */
export const fetchLiveLeg = (
  origin: LatLng,
  destination: LatLng,
  apiKey?: string,
): Promise<NavigationRoute> =>
  fetchNavigationRoute({
    origin,
    destination,
    apiKey,
    preferFastest: true,
    trafficAware: true,
  });
