/**
 * useBackgroundLocationTracker
 *
 * App-level hook. Mount once in root _layout.tsx.
 * Polls for rider's active rides and starts/stops background location
 * tracking automatically.
 */

import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRidesImRiding } from "../features/rides/api/rideProgress";
import { useAccessToken, useAuthState } from "../services/useAuthState";
import { useCurrentRider } from "../services/useCurrentRider";
import {
  startTracking,
  stopTracking,
  getActiveTrackingRideId,
  onLiveLocationWithdrawn,
  resumeTrackingInForeground,
} from "../services/backgroundLocationService";
import { noticeFor, ridePurposesToAsk, rideSharing, type ConsentNotice } from "../features/consent/core/consent";
import { CONSENTS_QUERY_KEY, useConsents } from "../features/consent/hooks/useConsents";
import { askRideConsent } from "../features/consent/hooks/rideConsentPrompt";

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
// A failed poll must not read as "no ride": that stopped tracking on every
// server hiccup and restarted it on the next good poll. Letting the error
// through keeps the last known rides until a poll succeeds.
const fetchMyActiveRides = (): Promise<RideSummary[]> => fetchRidesImRiding();

const logTrackingError = (action: string) => (error: unknown) =>
  console.warn(
    `[BgLocation] could not ${action} tracking:`,
    error instanceof Error ? error.message : error,
  );

const stopTrackingSafely = (): void => {
  stopTracking().catch(logTrackingError("stop"));
};

export function useBackgroundLocationTracker() {
  const isAuthenticated = useAuthState().status === "signed-in";
  const token = useAccessToken();
  const rider = useCurrentRider().rider;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const queryClient = useQueryClient();
  const consents = useConsents();
  const consentOverview = consents.data;
  const consentFailed = consents.isError;
  // The ride the consent sheet is open for, and rides the rider put it off for.
  const askingForRideRef = useRef<string | null>(null);
  const skippedRideIdsRef = useRef(new Set<string>());
  // Bumped when the sheet closes: the answers may not change the overview
  // (a "Not now"), and the decision below must run again either way.
  const [consentRound, setConsentRound] = useState(0);

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
      stopTrackingSafely();
      return;
    }

    // Not answered yet — still loading, or failing with nothing to go on.
    // Only a real answer may start or stop tracking.
    if (activeRides === undefined) return;

    // Any ride returned from GET /api/rides/riding is one this rider is
    // riding now; finishing it drops it from the list and stops tracking.
    const activeRide = activeRides[0] ?? null;

    const currentlyTracking = getActiveTrackingRideId();

    if (!activeRide) {
      // No active ride anymore — stop tracking
      if (currentlyTracking) stopTrackingSafely();
      return;
    }

    // Consent (E6). Wait for the rider's answers; if they can't be fetched
    // (no signal), ride on as before rather than hold up tracking.
    if (!consentOverview && !consentFailed) return;
    if (askingForRideRef.current) return;

    // Someone who said they are under 18 is never tracked.
    if (consentOverview?.declarations.age_18_plus === false) {
      if (currentlyTracking) stopTrackingSafely();
      return;
    }

    // Asked only once the 18+ question is answered, so the two never stack.
    if (
      consentOverview?.declarations.age_18_plus === true &&
      !skippedRideIdsRef.current.has(activeRide.id)
    ) {
      const notices = ridePurposesToAsk(consentOverview)
        .map((purpose) => noticeFor(consentOverview, purpose))
        .filter((notice): notice is ConsentNotice => notice !== undefined);
      if (notices.length > 0) {
        // Asked just before the ride's tracking starts; the answers refresh
        // the overview, and this effect runs again with them.
        askingForRideRef.current = activeRide.id;
        void askRideConsent(activeRide.id, notices).then(async (outcome) => {
          if (outcome === "skipped") skippedRideIdsRef.current.add(activeRide.id);
          // Wait for the fresh answers, or the old ones would ask again.
          await queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY }).catch(() => undefined);
          askingForRideRef.current = null;
          setConsentRound((round) => round + 1);
        });
        return;
      }
    }

    // Riders never asked share as before (option B); a no stops it.
    const sharing = consentOverview ? rideSharing(consentOverview) : { share: true, motion: true };
    if (!sharing.share) {
      if (currentlyTracking) stopTrackingSafely();
      return;
    }

    if (activeRide.id !== currentlyTracking) {
      // New active ride found — start tracking
      startTracking(activeRide.id, { motion: sharing.motion }).catch(logTrackingError("start"));
    }
  }, [activeRides, isAuthenticated, token, rider?.id, consentOverview, consentFailed, consentRound, queryClient]);

  // Withdrawn on this or another device: tracking has stopped; refresh the
  // answers so it isn't started again.
  useEffect(
    () =>
      onLiveLocationWithdrawn(() => {
        void queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY });
      }),
    [queryClient],
  );

  // Handle app state changes — resume foreground tracking when app comes back
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const wasInBackground = appStateRef.current !== "active";
        appStateRef.current = nextState;

        // The tracker can only start in the foreground; pick up one that
        // could not start, or that the OS stopped, while the app was away.
        if (nextState === "active" && wasInBackground && Platform.OS !== "web") {
          resumeTrackingInForeground().catch(logTrackingError("resume"));
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Cleanup on unmount (logout / app shutdown)
  useEffect(() => {
    return () => {
      stopTrackingSafely();
    };
  }, []);
}
