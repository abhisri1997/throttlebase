/**
 * Which routes answer "from here to there", and in what order.
 *
 * A searched place matches an end of a route when that end (or one of its
 * stops) is named after it, or when that end is within the route's own
 * radius: 15% of its length, at least 5 km and at most 25 km, so a short city
 * route has to start close by while a long trip can start across town.
 *
 * Routes ridden the other way count too, after same-direction ones. Their
 * gaps are measured from where the rider would begin: the route's end.
 */
import { haversineMeters, type LatLng } from "../../utils/polyline.js";

export const MIN_SEARCH_RADIUS_KM = 5;
export const MAX_SEARCH_RADIUS_KM = 25;
const RADIUS_SHARE_OF_LENGTH = 0.15;

export interface SearchPlace {
  lat: number;
  lng: number;
  /** The picked place's label, e.g. "Wayanad, Kerala, India"; its first part is matched by name. */
  name: string | null;
}

export interface RouteSearchQuery {
  from: SearchPlace | null;
  to: SearchPlace | null;
  minKm: number | null;
  maxKm: number | null;
  /** Every one of these must be among the route's highlights. */
  highlights: readonly string[];
}

export interface RouteCandidate {
  id: string;
  distance_km: number | null;
  start: LatLng | null;
  end: LatLng | null;
  start_name: string | null;
  end_name: string | null;
  stop_names: readonly string[];
  highlights: readonly string[];
}

export type RouteDirection = "forward" | "reverse";

export interface RouteMatch {
  id: string;
  direction: RouteDirection;
  nameMatched: boolean;
  /** From the searched start to where the rider would begin; null without one. */
  startGapKm: number | null;
  /** From where the rider would finish to the searched destination; null without one. */
  endGapKm: number | null;
}

export const searchRadiusKm = (distanceKm: number | null): number =>
  Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, (distanceKm ?? 0) * RADIUS_SHARE_OF_LENGTH));

/** "Wayanad, Kerala, India" → "wayanad". */
const searchTerm = (name: string | null): string | null => {
  const first = name?.split(",")[0]?.trim().toLowerCase();
  return first ? first : null;
};

const gapKm = (place: SearchPlace, point: LatLng | null): number | null =>
  point ? haversineMeters({ lat: place.lat, lng: place.lng }, point) / 1000 : null;

interface EndCheck {
  matched: boolean;
  byName: boolean;
  gapKm: number | null;
}

/** Does `place` match this end of the route (its point, its name, or a stop's name)? */
const checkEnd = (
  place: SearchPlace | null,
  point: LatLng | null,
  endName: string | null,
  route: RouteCandidate,
): EndCheck => {
  if (!place) return { matched: true, byName: false, gapKm: null };

  const term = searchTerm(place.name);
  const byName =
    term !== null &&
    [endName, ...route.stop_names].some((name) => name !== null && name.toLowerCase().includes(term));
  const gap = gapKm(place, point);
  const nearby = gap !== null && gap <= searchRadiusKm(route.distance_km);

  return { matched: byName || nearby, byName, gapKm: gap };
};

const passesFilters = (route: RouteCandidate, query: RouteSearchQuery): boolean => {
  const distance = route.distance_km;
  if (query.minKm !== null && (distance === null || distance < query.minKm)) return false;
  if (query.maxKm !== null && (distance === null || distance > query.maxKm)) return false;
  return query.highlights.every((highlight) => route.highlights.includes(highlight));
};

const matchRoute = (route: RouteCandidate, query: RouteSearchQuery): RouteMatch | null => {
  const forwardStart = checkEnd(query.from, route.start, route.start_name, route);
  const forwardEnd = checkEnd(query.to, route.end, route.end_name, route);
  if (forwardStart.matched && forwardEnd.matched) {
    return {
      id: route.id,
      direction: "forward",
      nameMatched: forwardStart.byName || forwardEnd.byName,
      startGapKm: forwardStart.gapKm,
      endGapKm: forwardEnd.gapKm,
    };
  }

  // Ridden the other way: the rider begins at the route's end.
  const reverseStart = checkEnd(query.from, route.end, route.end_name, route);
  const reverseEnd = checkEnd(query.to, route.start, route.start_name, route);
  if (reverseStart.matched && reverseEnd.matched) {
    return {
      id: route.id,
      direction: "reverse",
      nameMatched: reverseStart.byName || reverseEnd.byName,
      startGapKm: reverseStart.gapKm,
      endGapKm: reverseEnd.gapKm,
    };
  }

  return null;
};

const totalGap = (match: RouteMatch): number => (match.startGapKm ?? 0) + (match.endGapKm ?? 0);

/**
 * The routes that answer the search, best first: same direction before the
 * other way, name matches before nearby-only, then the smallest total gap.
 */
export const rankRouteMatches = (
  candidates: readonly RouteCandidate[],
  query: RouteSearchQuery,
): RouteMatch[] =>
  candidates
    .filter((route) => passesFilters(route, query))
    .map((route) => matchRoute(route, query))
    .filter((match): match is RouteMatch => match !== null)
    .sort(
      (a, b) =>
        Number(a.direction === "reverse") - Number(b.direction === "reverse") ||
        Number(b.nameMatched) - Number(a.nameMatched) ||
        totalGap(a) - totalGap(b) ||
        a.id.localeCompare(b.id),
    );
