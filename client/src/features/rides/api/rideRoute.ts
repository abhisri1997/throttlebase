/**
 * Saving the road a rider rode on a finished ride as a route. The server
 * builds the geometry from the rider's own recorded track.
 */
import { apiClient } from "../../../api/client";
import type { RouteHighlight } from "../core/saveRoute";

export type RouteVisibility = "public" | "private";

/** What saving a ride would produce: shown in the save sheet before saving. */
export interface RoutePreview {
  /** Set when this ride was already saved; open that route instead. */
  saved_route_id: string | null;
  start_name: string | null;
  end_name: string | null;
  distance_km: number;
  duration_s: number;
  stops: { ride_stop_id: string; name: string | null; distance_from_start_km: number }[];
}

export const fetchRoutePreview = async (rideId: string): Promise<RoutePreview> => {
  const { data } = await apiClient.get(`/api/rides/${rideId}/route/preview`);
  return data as RoutePreview;
};

export interface SaveRideAsRouteInput {
  title: string;
  visibility: RouteVisibility;
  highlights: RouteHighlight[];
  /** Only stops with a note; every note is optional. */
  stop_notes: { ride_stop_id: string; note: string }[];
}

export interface SavedRideRoute {
  route: { id: string; title: string; visibility: RouteVisibility };
  /** False when this ride had already been saved; that route is returned. */
  created: boolean;
}

export const saveRideAsRoute = async (
  rideId: string,
  input: SaveRideAsRouteInput,
): Promise<SavedRideRoute> => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/route`, input);
  return data as SavedRideRoute;
};
