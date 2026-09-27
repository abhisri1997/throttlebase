import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import { planRideOnRoute, type PlannableRoute, type RideDirection, type RoutePlan } from "../core/planRide";

export interface RoutePlanState {
  plan: RoutePlan | null;
  isLoading: boolean;
  /** The route could not be loaded, or it has no ends to plan a ride between. */
  isUnavailable: boolean;
}

const fetchRoute = async (routeId: string): Promise<PlannableRoute> => {
  const { data } = await apiClient.get<PlannableRoute>(`/api/routes/${routeId}`);
  return data;
};

/**
 * A saved route as a ride plan. Shares the route page's cache entry, so
 * planning from there opens without another request.
 */
export const useRoutePlan = (routeId: string, direction: RideDirection): RoutePlanState => {
  const query = useQuery({ queryKey: ["route", routeId], queryFn: () => fetchRoute(routeId) });

  const plan = useMemo(
    () => (query.data ? planRideOnRoute(query.data, direction) : null),
    [query.data, direction],
  );

  return {
    plan,
    isLoading: query.isPending,
    isUnavailable: query.isError || (query.isSuccess && plan === null),
  };
};
