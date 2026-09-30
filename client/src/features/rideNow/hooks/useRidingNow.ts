import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchRidesImRiding } from "../../rides/api/rideProgress";
import { useAuthState } from "../../../services/useAuthState";
import type { RidingRide } from "../core/ridingRide";

/** Shared by the tracker, the ride bar and anything that starts or finishes a ride. */
export const RIDING_NOW_QUERY_KEY = ["my-active-rides-bg"] as const;

const POLL_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 15_000;

export interface RidingNow {
  /** Undefined until the first answer: not the same as riding nothing. */
  rides: RidingRide[] | undefined;
  /** The ride under way, if any. */
  ride: RidingRide | null;
  /** When the server was last read, for running the clock on between polls. */
  readAtMs: number;
}

/**
 * The rides this rider is riding right now (GET /api/rides/riding). A phone
 * rides one at a time, so the first is the one under way. Only on a phone:
 * the website doesn't track rides.
 *
 * A failed poll keeps the last answer rather than reading as "no ride",
 * which would stop tracking on every server hiccup.
 */
export const useRidingNow = (): RidingNow => {
  const isSignedIn = useAuthState().status === "signed-in";

  const query = useQuery({
    queryKey: RIDING_NOW_QUERY_KEY,
    queryFn: fetchRidesImRiding,
    enabled: isSignedIn && Platform.OS !== "web",
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: STALE_AFTER_MS,
  });

  const rides = query.data;
  return { rides, ride: rides?.[0] ?? null, readAtMs: query.dataUpdatedAt };
};
