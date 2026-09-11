import { useEffect, useRef } from "react";
import type { NavigationSessionState } from "../core/navigationSession";
import type { TripWaypoint, WaypointKind } from "../core/tripPlan";

export interface WaypointReport {
  waypoint_id: string;
  waypoint_kind: WaypointKind;
  reached_at: string;
}

interface UseWaypointReportsInput {
  rideId: string | undefined;
  session: NavigationSessionState | null;
  waypoints: readonly TripWaypoint[] | null;
  inRoom: boolean;
  /** Sends one report; false when it could not be sent yet. */
  report: (input: WaypointReport) => boolean;
}

/**
 * Tells the server when this rider reaches each waypoint, for the ride history.
 * Arrivals made before the live room is joined go out once it is; the server
 * ignores repeats, so a restored session sending them again is harmless.
 */
export const useWaypointReports = ({
  rideId,
  session,
  waypoints,
  inRoom,
  report,
}: UseWaypointReportsInput): void => {
  const reportedIdsRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    reportedIdsRef.current = new Set();
  }, [rideId]);

  useEffect(() => {
    if (!session || !waypoints || !inRoom) return;

    const newlySent = waypoints.filter((waypoint) => {
      const reachedAt = session.reachedAt[waypoint.id];
      if (reachedAt === undefined || reportedIdsRef.current.has(waypoint.id)) return false;

      return report({
        waypoint_id: waypoint.id,
        waypoint_kind: waypoint.kind,
        reached_at: new Date(reachedAt).toISOString(),
      });
    });

    if (newlySent.length > 0) {
      reportedIdsRef.current = new Set([
        ...reportedIdsRef.current,
        ...newlySent.map((waypoint) => waypoint.id),
      ]);
    }
  }, [inRoom, report, session, waypoints]);
};
