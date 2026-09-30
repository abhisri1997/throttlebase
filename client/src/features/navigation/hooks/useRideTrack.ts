import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "../../../api/client";
import { decodePolyline } from "../core/geometry";
import type { LatLng } from "../types/navigation";
import type { RidingSplit } from "../../rides/core/rideSummary";

const RideTrackResponseSchema = z.object({
  track: z.object({
    encoded_polyline: z.string(),
    distance_m: z.number().nonnegative(),
    duration_s: z.number().nonnegative(),
  }),
  waypoint_arrivals: z.array(
    z.object({
      waypoint_id: z.string(),
      reached_at: z.string(),
    }),
  ),
  /** Riding against stopped; missing from servers older than this app. */
  riding: z
    .object({
      riding_time_s: z.number().nonnegative(),
      riding_distance_m: z.number().nonnegative(),
      stopped_s: z.number().nonnegative(),
    })
    .optional(),
});

export interface RideTrack {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  /** Waypoint id → epoch ms at which this rider reached it. */
  arrivals: Readonly<Record<string, number>>;
  /** The riding alone, stops left out; null from an older server. */
  riding: RidingSplit | null;
}

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { response?: { status?: number } }).response?.status === 404;

export const fetchRideTrack = async (rideId: string): Promise<RideTrack | null> => {
  try {
    const { data } = await apiClient.get(`/api/rides/${rideId}/track`);
    const parsed = RideTrackResponseSchema.parse(data);

    const arrivals = parsed.waypoint_arrivals.flatMap((arrival): [string, number][] => {
      const reachedAt = Date.parse(arrival.reached_at);
      return Number.isFinite(reachedAt) ? [[arrival.waypoint_id, reachedAt]] : [];
    });

    return {
      coordinates: decodePolyline(parsed.track.encoded_polyline),
      distanceMeters: parsed.track.distance_m,
      durationSeconds: parsed.track.duration_s,
      arrivals: Object.fromEntries(arrivals),
      riding: parsed.riding
        ? {
            ridingTimeS: parsed.riding.riding_time_s,
            ridingDistanceM: parsed.riding.riding_distance_m,
            stoppedS: parsed.riding.stopped_s,
          }
        : null,
    };
  } catch (error: unknown) {
    // A ride that never went live has no track; that is not a failure.
    if (isNotFound(error)) return null;
    throw error;
  }
};

/**
 * This rider's travelled track for a finished ride. A finished ride doesn't
 * change, so it is fetched once and kept.
 */
export const useRideTrack = (
  rideId: string | undefined,
  isEnabled: boolean,
): { track: RideTrack | null; isError: boolean } => {
  const query = useQuery({
    queryKey: ["ride-track", rideId],
    queryFn: () => fetchRideTrack(rideId!),
    enabled: Boolean(rideId) && isEnabled,
    staleTime: Infinity,
    retry: 1,
  });

  return { track: query.data ?? null, isError: query.isError };
};
