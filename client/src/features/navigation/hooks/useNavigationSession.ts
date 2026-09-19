import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  reconcileSessionWithPlan,
  reduceNavigationSession,
  restoreSession,
  type NavigationSessionEvent,
  type NavigationSessionState,
} from "../core/navigationSession";
import { placeRiderOnTrip, type TripGeometry } from "../core/routeProgress";
import { tripPlanKey, type TripWaypoint } from "../core/tripPlan";
import type { NavigationFix } from "../types/navigation";

const storageKey = (rideId: string): string => `nav-progress:${rideId}`;

const toLocationEvent = (fix: NavigationFix): NavigationSessionEvent => ({
  type: "LOCATION",
  coordinate: fix.coordinate,
  accuracyMeters: fix.accuracyMeters,
  timestamp: fix.timestamp,
});

interface UseNavigationSessionInput {
  rideId: string | undefined;
  waypoints: readonly TripWaypoint[] | null;
  tripGeometry: TripGeometry | null;
  /** Placement waits for the planned route, so a rider joining mid-ride isn't sent to the start. */
  isPlannedRouteSettled: boolean;
  fix: NavigationFix | null;
  /** Holds placement while nothing useful is known yet, such as where the crew is. */
  isPlacementBlocked?: boolean;
  /**
   * This rider would be asked how to join a ride that set off without them.
   * Placing them before they answer would pick for them — but only until they
   * have answered, which the session remembers across reopens.
   */
  isJoinChoicePending?: boolean;
}

export interface NavigationSessionControls {
  session: NavigationSessionState | null;
  skipTarget: () => void;
  /**
   * Sets the rider off from a chosen waypoint, counting everything before it
   * as passed. Unlike the automatic placement this also moves a rider who has
   * already been placed — a late joiner's answer arrives after the crew's
   * positions do, which is well after their own first fix.
   */
  placeAt: (targetIndex: number) => void;
}

/**
 * Runs the waypoint lifecycle for this rider — which stop is next, which are
 * done — and keeps it on the device so reopening navigation resumes rather
 * than restarting from the ride's start.
 */
export const useNavigationSession = ({
  rideId,
  waypoints,
  tripGeometry,
  isPlannedRouteSettled,
  fix,
  isPlacementBlocked = false,
  isJoinChoicePending = false,
}: UseNavigationSessionInput): NavigationSessionControls => {
  const planKey = useMemo(() => (waypoints ? tripPlanKey(waypoints) : null), [waypoints]);
  const [session, setSession] = useState<NavigationSessionState | null>(null);

  const dispatch = useCallback(
    (event: NavigationSessionEvent) => {
      if (!waypoints) return;
      setSession((previous) =>
        previous ? reduceNavigationSession(previous, event, waypoints) : previous,
      );
    },
    [waypoints],
  );

  // A different ride never inherits this one's progress.
  useEffect(() => {
    setSession(null);
  }, [rideId]);

  // Restore saved progress when navigation opens; reconcile it when the plan changes mid-ride.
  useEffect(() => {
    if (!rideId || !waypoints || !planKey) return;

    let cancelled = false;

    AsyncStorage.getItem(storageKey(rideId))
      .then((raw) => (raw ? (JSON.parse(raw) as unknown) : null))
      .catch(() => null)
      .then((saved) => {
        if (cancelled) return;
        setSession((previous) =>
          previous
            ? reconcileSessionWithPlan(previous, waypoints, planKey)
            : restoreSession(saved, waypoints, planKey),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [planKey, rideId, waypoints]);

  // Save progress so a reopened screen resumes where the rider was.
  useEffect(() => {
    if (!rideId || !session) return;

    AsyncStorage.setItem(storageKey(rideId), JSON.stringify(session)).catch(
      (error: unknown) => {
        if (__DEV__) {
          console.warn("[navigation-session] could not save progress", error);
        }
      },
    );
  }, [rideId, session]);

  // Place the rider once, from their first fix, after the planned route settles.
  useEffect(() => {
    if (!session || session.isPlaced || !waypoints || !fix || !isPlannedRouteSettled) return;
    if (isPlacementBlocked) return;
    // A late rider is choosing how to join; placing them now would pick for them.
    if (isJoinChoicePending && !session.isJoinChosen) return;

    const canUsePlannedRoute =
      tripGeometry !== null && tripGeometry.waypointAlongMeters.length === waypoints.length;
    const fromPosition = canUsePlannedRoute
      ? placeRiderOnTrip(fix.coordinate, tripGeometry)
      : 0;

    dispatch({ type: "PLACE", targetIndex: fromPosition });
    // A rider already standing at their first waypoint arrives without waiting for another fix.
    dispatch(toLocationEvent(fix));
  }, [
    dispatch,
    fix,
    isJoinChoicePending,
    isPlacementBlocked,
    isPlannedRouteSettled,
    session,
    tripGeometry,
    waypoints,
  ]);

  // Every fix may reach or leave a waypoint.
  useEffect(() => {
    if (fix) {
      dispatch(toLocationEvent(fix));
    }
  }, [dispatch, fix]);

  const skipTarget = useCallback(() => dispatch({ type: "SKIP_TARGET" }), [dispatch]);

  const placeAt = useCallback(
    (targetIndex: number) => {
      dispatch({ type: "PLACE", targetIndex, isJoinChoice: true });
      // A rider placed at a waypoint they are already standing on arrives
      // without waiting for the next fix.
      if (fix) dispatch(toLocationEvent(fix));
    },
    [dispatch, fix],
  );

  return { session, skipTarget, placeAt };
};
