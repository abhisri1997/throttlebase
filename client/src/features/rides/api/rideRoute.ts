/**
 * Saving the road a rider rode on a finished ride as a route. The server
 * builds the geometry from the rider's own recorded track.
 */
import { apiClient } from "../../../api/client";

export type RouteVisibility = "public" | "private";

export interface SavedRideRoute {
  route: { id: string; title: string; visibility: RouteVisibility };
  /** False when this ride had already been saved; that route is returned. */
  created: boolean;
}

export const saveRideAsRoute = async (
  rideId: string,
  input: { title: string; visibility: RouteVisibility },
): Promise<SavedRideRoute> => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/route`, input);
  return data as SavedRideRoute;
};
