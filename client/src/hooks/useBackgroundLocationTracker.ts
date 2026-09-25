/**
 * useBackgroundLocationTracker
 *
 * App-level hook. Mount once in root _layout.tsx.
 * Polls for rider's active rides and starts/stops background location
 * tracking automatically.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchRidesImRiding } from "../features/rides/api/rideProgress";
import { useAccessToken, useAuthState } from "../services/useAuthState";
import { useCurrentRider } from "../services/useCurrentRider";
import {
  startTracking,
  stopTracking,
  getActiveTrackingRideId,
} from "../services/backgroundLocationService";

type RideSummary = {
  id: string;
  status: string;
  captain_id: string;
};

/**
 * The rides this rider is riding right now: their own ride is under way —
 * started early, or the group rolled out — and they have not finished. A ride
 * still "scheduled" counts once they start early; one they have finished does
 * not, even while the rest of the group rides on.
 */
const fetchMyActiveRides = async (): Promise<RideSummary[]> => {
  try {
    return await fetchRidesImRiding();
  } catch {
    return [];
  }
};

export function useBackgroundLocationTracker() {
  const isAuthenticated = useAuthState().status === "signed-in";
  const token = useAccessToken();
  const rider = useCurrentRider().rider;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Poll for active rides every 30s (lightweight query)
  const { data: activeRides } = useQuery({
    queryKey: ["my-active-rides-bg"],
    queryFn: fetchMyActiveRides,
    enabled: isAuthenticated && Platform.OS !== "web",
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 15000,
  });

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated || !token || !rider?.id) {
      // Not authenticated or web — stop any active tracking
      stopTracking();
      return;
    }

    // Any ride returned from GET /api/rides/riding is one this rider is
    // riding now; finishing it drops it from the list and stops tracking.
    const activeRide = activeRides?.[0] ?? null;

    const currentlyTracking = getActiveTrackingRideId();

    if (activeRide && activeRide.id !== currentlyTracking) {
      // New active ride found — start tracking
      startTracking(activeRide.id, token);
    } else if (!activeRide && currentlyTracking) {
      // No active ride anymore — stop tracking
      stopTracking();
    }
  }, [activeRides, isAuthenticated, token, rider?.id]);

  // Handle app state changes — resume foreground tracking when app comes back
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        appStateRef.current = nextState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Cleanup on unmount (logout / app shutdown)
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);
}
