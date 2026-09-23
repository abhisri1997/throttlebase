import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildTripGeometry, type TripGeometry } from "../core/routeProgress";
import { tripPlanKey, type TripWaypoint } from "../core/tripPlan";
import { fetchPlannedRideRoute } from "../services/navigationRouteService";
import type { NavigationRoute, RouteLeg } from "../types/navigation";

/** How long an unused planned route stays cached — e.g. between ride detail and navigation. */
const PLANNED_ROUTE_GC_MS = 60 * 60 * 1000;

export const plannedRouteQueryKey = (planKey: string) => ["planned-route", planKey] as const;

export interface PlannedRouteState {
  route: NavigationRoute | null;
  /**
   * One leg per consecutive pair of waypoints, or null when they don't line up
   * (e.g. two waypoints at the same spot collapse into one).
   */
  legs: RouteLeg[] | null;
  tripGeometry: TripGeometry | null;
  /** True once the fetch has finished — successfully or not — or there is nothing to fetch. */
  isSettled: boolean;
}

/**
 * The ride as planned, fetched once per plan and shared by every screen that
 * shows it. The query key is the plan itself, so it never goes stale: any
 * change to a waypoint is a different key.
 */
export const usePlannedRoute = (
  waypoints: readonly TripWaypoint[] | null,
): PlannedRouteState => {
  const planKey = waypoints ? tripPlanKey(waypoints) : "";
  const canFetch = Boolean(waypoints && waypoints.length >= 2);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: plannedRouteQueryKey(planKey),
    queryFn: async () => {
      const next = await fetchPlannedRideRoute(
        (waypoints ?? []).map((waypoint) => waypoint.coordinate),
      );

      // A fallback means the proxy refused or was unreachable, not that the
      // plan changed. Replacing a real route with straight lines would redraw
      // the whole ride as a wrong-looking shortcut, so keep what we had.
      if (next.source === "fallback") {
        const previous = queryClient.getQueryData<NavigationRoute>(
          plannedRouteQueryKey(planKey),
        );
        if (previous && previous.source !== "fallback") return previous;
      }

      return next;
    },
    enabled: canFetch,
    staleTime: Infinity,
    gcTime: PLANNED_ROUTE_GC_MS,
    retry: 1,
  });

  const route = query.data ?? null;
  const legs =
    route && waypoints && route.legs.length === waypoints.length - 1 ? route.legs : null;

  const tripGeometry = useMemo(
    () => (route && legs ? buildTripGeometry(route) : null),
    [legs, route],
  );

  return { route, legs, tripGeometry, isSettled: !canFetch || !query.isPending };
};
