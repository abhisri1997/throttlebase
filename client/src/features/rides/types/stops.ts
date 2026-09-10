export type StopType = "fuel" | "rest" | "photo";

/** A stop the captain has committed to for this ride. */
export interface PlannedStop {
  type: StopType;
  /** [longitude, latitude] — GeoJSON order, matching the API contract. */
  location_coords: [number, number];
  name: string;
  address?: string;
  google_place_id?: string;
  /**
   * Metres into the ride. Present for stops chosen from suggestions, and used
   * to keep the list in route order so the route does not backtrack.
   */
  distance_along_route_m?: number;
}

/** A candidate returned by search-along-route, not yet added to the ride. */
export interface StopSuggestion {
  google_place_id: string;
  name: string;
  address: string;
  coords: [number, number];
  distance_along_route_m: number;
  detour_from_route_m: number;
}

export interface StopSuggestionResponse {
  suggestions: StopSuggestion[];
  cached: boolean;
  /** Budget or quota stopped the lookup; the UI should offer manual search. */
  degraded: boolean;
}

export const STOP_TYPES: StopType[] = ["fuel", "rest", "photo"];

export const STOP_ICONS: Record<StopType, string> = {
  fuel: "⛽",
  rest: "☕",
  photo: "📸",
};

export const STOP_LABELS: Record<StopType, string> = {
  fuel: "Fuel",
  rest: "Food",
  photo: "Photo",
};

/**
 * Inserts a stop at its correct position along the route.
 *
 * Appending in tap order is what makes a route backtrack: stops become
 * Directions waypoints in array order, so a stop 90km in added before one 40km
 * in sends the ride back on itself. Stops without a known position keep their
 * relative order at the end.
 */
export const insertStopInRouteOrder = (
  stops: PlannedStop[],
  candidate: PlannedStop,
): PlannedStop[] => {
  if (candidate.distance_along_route_m === undefined) {
    return [...stops, candidate];
  }

  const insertAt = stops.findIndex(
    (stop) =>
      stop.distance_along_route_m !== undefined &&
      stop.distance_along_route_m > candidate.distance_along_route_m!,
  );

  if (insertAt === -1) return [...stops, candidate];

  return [...stops.slice(0, insertAt), candidate, ...stops.slice(insertAt)];
};

/** "42 km in", or "800 m in" for stops close to the start. */
export const formatDistanceAlong = (meters: number): string =>
  meters >= 1000
    ? `${Math.round(meters / 1000)} km in`
    : `${Math.round(meters)} m in`;

/** "1.1 km off route", or "on route" when it is effectively on the line. */
export const formatDetour = (meters: number): string => {
  if (meters < 100) return "on route";
  if (meters < 1000) return `${Math.round(meters)} m off route`;
  return `${(meters / 1000).toFixed(1)} km off route`;
};
