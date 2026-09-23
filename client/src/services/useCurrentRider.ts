import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { useAuthState } from "./useAuthState";

/**
 * The signed-in rider's profile.
 *
 * Replaces the old auth store's cached `rider` object. Keeping the profile
 * out of the session is deliberate: a session is about whether you may act,
 * a profile is about who you are, and the profile changes far more often —
 * an edit elsewhere used to leave a stale copy in storage until sign-out.
 *
 * react-query gives caching, revalidation and a single in-flight request
 * across every screen that asks.
 */
export interface CurrentRider {
  id: string;
  username: string | null;
  display_name: string;
  email: string | null;
  profile_picture_url: string | null;
  experience_level: string | null;
  location_city: string | null;
  location_coords: unknown;
  total_rides?: number;
  total_distance_km?: number;
  roles?: string[];
  [key: string]: unknown;
}

export const CURRENT_RIDER_KEY = ["riders", "me"] as const;

export const useCurrentRider = () => {
  const auth = useAuthState();
  const isSignedIn = auth.status === "signed-in";

  const query = useQuery<CurrentRider | null>({
    queryKey: CURRENT_RIDER_KEY,
    enabled: isSignedIn,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await apiClient.get("/api/riders/me");
      return (response.data?.rider ?? null) as CurrentRider | null;
    },
  });

  return {
    rider: query.data ?? null,
    /** The rider id, available from the session before the profile loads. */
    riderId: isSignedIn ? auth.session.riderId : null,
    isLoading: query.isLoading,
    isSignedIn,
    refetch: query.refetch,
  };
};

/** Call after any mutation that changes the rider's own profile. */
export const useRefreshCurrentRider = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CURRENT_RIDER_KEY });
};
