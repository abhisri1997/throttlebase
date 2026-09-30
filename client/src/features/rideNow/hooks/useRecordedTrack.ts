import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { haversineMeters } from "../../navigation/core/geometry";
import { fetchRideTrack } from "../../navigation/hooks/useRideTrack";
import type { LatLng, NavigationFix } from "../../navigation/types/navigation";

/** Closer fixes add nothing to the drawn line. */
const MIN_POINT_GAP_METERS = 5;

/**
 * The line ridden so far, behind the rider's puck: this rider's own recorded
 * track when the screen opens (so reopening it mid-ride shows the whole ride),
 * then each fix since. Kept apart from the finished ride's track in the cache,
 * so the summary never shows a mid-ride copy.
 */
export const useRecordedTrack = (rideId: string | undefined, fix: NavigationFix | null): LatLng[] => {
  const recorded = useQuery({
    queryKey: ["ride-track", rideId, "live"],
    queryFn: () => fetchRideTrack(rideId!),
    enabled: Boolean(rideId),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const [since, setSince] = useState<LatLng[]>([]);
  useEffect(() => {
    if (!fix) return;
    setSince((points) => {
      const last = points[points.length - 1];
      return last && haversineMeters(last, fix.coordinate) < MIN_POINT_GAP_METERS
        ? points
        : [...points, fix.coordinate];
    });
  }, [fix]);

  const recordedPoints = recorded.data?.coordinates;
  return useMemo(() => [...(recordedPoints ?? []), ...since], [recordedPoints, since]);
};
