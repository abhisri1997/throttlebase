import type { LatLng, NavigationRoute, NavigationStep } from "../types/navigation";

const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toRad = (value: number): number => (value * Math.PI) / 180;

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
  };
};

type DirectionsLeg = {
  distance?: { value: number };
  duration?: { value: number };
  steps?: Array<{
    html_instructions?: string;
    distance?: { value: number };
    duration?: { value: number };
    start_location?: { lat: number; lng: number };
    end_location?: { lat: number; lng: number };
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

export const fetchNavigationRoute = async (input: {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  apiKey?: string;
}): Promise<NavigationRoute> => {
  const fallbackPoints = [
    input.origin,
    ...(input.waypoints || []),
    input.destination,
  ];

  if (!input.apiKey) {
    return buildFallbackRoute(fallbackPoints);
  }

  const origin = `${input.origin.latitude},${input.origin.longitude}`;
  const destination = `${input.destination.latitude},${input.destination.longitude}`;
  const waypointParam = (input.waypoints || [])
    .map((point) => `${point.latitude},${point.longitude}`)
    .join("|");

  const params = new URLSearchParams({
    origin,
    destination,
    mode: "bicycling",
    departure_time: "now",
    key: input.apiKey,
  });

  if (waypointParam) {
    params.set("waypoints", waypointParam);
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
  );

  const payload = (await response.json()) as DirectionsResponse;

  if (!response.ok || payload.status !== "OK" || !payload.routes?.[0]) {
    return buildFallbackRoute(fallbackPoints);
  }

  const route = payload.routes[0];
  const decoded = route.overview_polyline?.points
    ? decodePolyline(route.overview_polyline.points)
    : fallbackPoints;

  const steps: NavigationStep[] = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const start = step.start_location
        ? {
            latitude: step.start_location.lat,
            longitude: step.start_location.lng,
          }
        : null;
      const end = step.end_location
        ? {
            latitude: step.end_location.lat,
            longitude: step.end_location.lng,
          }
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
    return buildFallbackRoute(decoded.length > 1 ? decoded : fallbackPoints);
  }

  const totalDistanceMeters = (route.legs || []).reduce(
    (sum, leg) => sum + (leg.distance?.value || 0),
    0,
  );
  const totalDurationSeconds = (route.legs || []).reduce(
    (sum, leg) => sum + (leg.duration?.value || 0),
    0,
  );

  return {
    source: "directions",
    polyline: decoded,
    steps,
    totalDistanceMeters,
    totalDurationSeconds,
  };
};
