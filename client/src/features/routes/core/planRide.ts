/**
 * Planning a new ride on a saved route: its ends, its stops, and whether the
 * ride follows its road, either way round.
 *
 * Riders pick a route for its road, for its stops, or for both. The route's
 * highlights say which, so they set what the form starts with; the captain
 * can change either.
 */
import { insertStopInRouteOrder, type PlannedStop } from "../../rides/types/stops";
import { placesHeadline } from "./routeSummary";

export type RideDirection = "forward" | "reverse";

type LngLat = [number, number];

export interface PlannableRouteStop {
  position: number;
  name: string | null;
  lat: number;
  lng: number;
  note: string | null;
  distance_from_start_km: number | string | null;
}

/** What GET /api/routes/:id returns that planning needs. */
export interface PlannableRoute {
  id: string;
  title: string;
  start_name: string | null;
  end_name: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  distance_km: number | string | null;
  highlights: readonly string[];
  stops: readonly PlannableRouteStop[];
  road_via?: readonly LngLat[] | null;
  geojson?: { coordinates?: number[][] } | null;
}

export interface RoutePlanStop {
  name: string;
  coords: LngLat;
  note: string | null;
  /** From the ride's start, whichever way round it is ridden. */
  distanceKm: number | null;
}

export interface RoutePlanEnd {
  name: string;
  coords: LngLat;
}

export interface PlanDefaults {
  followRoad: boolean;
  keepStops: boolean;
}

export interface RoutePlan {
  routeId: string;
  direction: RideDirection;
  title: string;
  start: RoutePlanEnd;
  end: RoutePlanEnd;
  stops: RoutePlanStop[];
  /** Points that hold the ride to the route's road, in riding order. */
  roadVia: LngLat[];
  defaults: PlanDefaults;
}

/** Highlights about the road itself, as opposed to where it stops. */
const ROAD_HIGHLIGHTS: ReadonlySet<string> = new Set([
  "scenic_road",
  "good_surface",
  "quiet",
  "well_lit",
  "twisties",
  "night_ride_friendly",
  "beginner_friendly",
]);
const STOPS_HIGHLIGHT = "great_stops";

/** Planned stops copied from a route are breaks on the way, not fuel or photo stops. */
const ROUTE_STOP_TYPE = "rest" as const;

export const parseRideDirection = (value: unknown): RideDirection =>
  value === "reverse" ? "reverse" : "forward";

/**
 * Praised for its road: follow it. Praised for its stops: keep them. Praised
 * for both, or for nothing the app can tell apart: keep both, as it was ridden.
 */
export const planDefaults = (highlights: readonly string[]): PlanDefaults => {
  const praisesRoad = highlights.some((highlight) => ROAD_HIGHLIGHTS.has(highlight));
  const praisesStops = highlights.includes(STOPS_HIGHLIGHT);
  return {
    followRoad: praisesRoad || !praisesStops,
    keepStops: praisesStops || !praisesRoad,
  };
};

const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toLngLat = (lat: number | null, lng: number | null, fallback: number[] | undefined): LngLat | null => {
  if (lat !== null && lng !== null) return [lng, lat];
  if (fallback && fallback.length >= 2) return [fallback[0]!, fallback[1]!];
  return null;
};

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

/** The route as a ride: null when it has no usable ends. */
export const planRideOnRoute = (route: PlannableRoute, direction: RideDirection): RoutePlan | null => {
  const line = route.geojson?.coordinates ?? [];
  const first = toLngLat(route.start_lat, route.start_lng, line[0]);
  const last = toLngLat(route.end_lat, route.end_lng, line[line.length - 1]);
  if (!first || !last) return null;

  const isReverse = direction === "reverse";
  const routeKm = toNumber(route.distance_km);
  const forwardStops = route.stops.map((stop): RoutePlanStop => ({
    name: stop.name?.trim() || `Stop ${stop.position}`,
    coords: [stop.lng, stop.lat],
    note: stop.note,
    distanceKm: toNumber(stop.distance_from_start_km),
  }));
  const stops = isReverse
    ? [...forwardStops].reverse().map((stop) => ({
        ...stop,
        distanceKm:
          stop.distanceKm !== null && routeKm !== null ? roundToTenth(routeKm - stop.distanceKm) : null,
      }))
    : forwardStops;

  const startName = isReverse ? route.end_name : route.start_name;
  const endName = isReverse ? route.start_name : route.end_name;
  const roadVia = [...(route.road_via ?? [])];

  return {
    routeId: route.id,
    direction,
    title: placesHeadline(startName, endName) ?? route.title,
    start: { name: startName ?? "Start", coords: isReverse ? last : first },
    end: { name: endName ?? "Destination", coords: isReverse ? first : last },
    stops,
    roadVia: isReverse ? roadVia.reverse() : roadVia,
    defaults: planDefaults(route.highlights),
  };
};

const sameCoords = (left: LngLat, right: LngLat): boolean =>
  left[0].toFixed(6) === right[0].toFixed(6) && left[1].toFixed(6) === right[1].toFixed(6);

export const routeStopAsPlanned = (stop: RoutePlanStop): PlannedStop => ({
  type: ROUTE_STOP_TYPE,
  location_coords: stop.coords,
  name: stop.name,
  ...(stop.distanceKm !== null ? { distance_along_route_m: Math.round(stop.distanceKm * 1000) } : {}),
});

export const isRouteStopKept = (stops: readonly PlannedStop[], stop: RoutePlanStop): boolean =>
  stops.some((planned) => sameCoords(planned.location_coords, stop.coords));

/** Adds a route stop in road order, or removes it; the captain's own stops are untouched. */
export const keepRouteStop = (
  stops: readonly PlannedStop[],
  stop: RoutePlanStop,
  keep: boolean,
): PlannedStop[] => {
  const without = stops.filter((planned) => !sameCoords(planned.location_coords, stop.coords));
  return keep ? insertStopInRouteOrder(without, routeStopAsPlanned(stop)) : without;
};

export const initialRideStops = (plan: RoutePlan): PlannedStop[] =>
  plan.defaults.keepStops ? plan.stops.map(routeStopAsPlanned) : [];
