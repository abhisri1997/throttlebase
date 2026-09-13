import { useMemo } from "react";
import { polylineAhead, projectOntoPolyline } from "../core/geometry";
import { buildGuidance, type Guidance, type RideState } from "../core/guidance";
import {
  getWaypointStatuses,
  type NavigationSessionState,
  type WaypointStatus,
} from "../core/navigationSession";
import {
  buildLegGeometry,
  locateStep,
  remainingLegMeters,
  remainingLegSeconds,
  OFF_ROUTE_THRESHOLD_METERS,
} from "../core/routeProgress";
import type { TripWaypoint } from "../core/tripPlan";
import { EMPTY_TRIP_SUMMARY, summarizeTrip, type TripSummary } from "../core/tripSummary";
import type { LatLng, NavigationFix, NavigationStep, RouteLeg } from "../types/navigation";
import type { LiveLegState } from "./useLiveLeg";

interface UseTripProgressInput {
  waypoints: readonly TripWaypoint[] | null;
  session: NavigationSessionState | null;
  plannedLegs: RouteLeg[] | null;
  isPlannedRouteSettled: boolean;
  liveLeg: LiveLegState;
  rideState: RideState;
  /** Matches the rider to the planned leg while there is no live one. */
  fix: NavigationFix | null;
}

export interface TripProgress {
  /** Legs still to ride after the current one. */
  laterLegs: RouteLeg[];
  /** The leg being ridden, from under the rider forward. */
  currentLegLine: LatLng[];
  waypointStatuses: WaypointStatus[];
  guidance: Guidance;
  summary: TripSummary;
  routeStatusLabel: string | null;
  isRouteLoading: boolean;
}

interface LiveMetrics {
  upcomingStep: NavigationStep | null;
  followingStep: NavigationStep | null;
  distanceToManeuverMeters: number;
  remainingMeters: number;
  remainingSeconds: number;
}

/** Everything the screen shows about where the rider is on the trip, derived from the session and routes. */
export const useTripProgress = ({
  waypoints,
  session,
  plannedLegs,
  isPlannedRouteSettled,
  liveLeg,
  rideState,
  fix,
}: UseTripProgressInput): TripProgress => {
  const phase = session?.phase ?? "NAVIGATING";
  const targetIndex = session?.targetIndex ?? 0;
  const isPlaced = session?.isPlaced ?? false;

  // Before the rider is placed — a preview, or waiting for GPS — the whole ride shows.
  const laterLegs = useMemo((): RouteLeg[] => {
    if (!plannedLegs) return [];
    if (!isPlaced) return plannedLegs;
    if (phase === "FINISHED") return [];
    return plannedLegs.slice(phase === "AT_WAYPOINT" ? targetIndex + 1 : targetIndex);
  }, [isPlaced, phase, plannedLegs, targetIndex]);

  // The planned leg standing in for the live one: while waiting at a stop, the
  // leg onward from it; while a live leg loads, the leg in progress.
  const standInLeg = useMemo((): RouteLeg | null => {
    if (!plannedLegs || !isPlaced) return null;
    if (phase === "AT_WAYPOINT") return plannedLegs[targetIndex] ?? null;
    if (phase === "NAVIGATING") return plannedLegs[targetIndex - 1] ?? null;
    return null;
  }, [isPlaced, phase, plannedLegs, targetIndex]);

  const { leg: liveRouteLeg, geometry: liveGeometry, progress: liveProgress } = liveLeg;

  // Waiting at a stop, or before a live leg's first fetch lands, the rider is
  // matched to the planned leg instead. Without this the line and the distance
  // to go sit frozen at the whole leg until the live one arrives.
  const standInGeometry = useMemo(
    () => (standInLeg ? buildLegGeometry(standInLeg) : null),
    [standInLeg],
  );

  const standInProgress = useMemo(() => {
    if (!standInGeometry || !fix || standInGeometry.polyline.length < 2) return null;

    const projection = projectOntoPolyline(
      fix.coordinate,
      standInGeometry.polyline,
      standInGeometry.cumulative,
      { headingDegrees: fix.headingDegrees },
    );

    // A rider nowhere near the planned leg keeps the whole leg drawn.
    return projection && projection.offsetMeters <= OFF_ROUTE_THRESHOLD_METERS ? projection : null;
  }, [fix, standInGeometry]);

  const currentLegLine = useMemo((): LatLng[] => {
    if (liveGeometry) {
      return liveProgress ? polylineAhead(liveGeometry.polyline, liveProgress) : liveGeometry.polyline;
    }
    if (standInGeometry && standInProgress) {
      return polylineAhead(standInGeometry.polyline, standInProgress);
    }
    return standInLeg?.polyline ?? [];
  }, [liveGeometry, liveProgress, standInGeometry, standInLeg, standInProgress]);

  const waypointStatuses = useMemo(
    () => (waypoints ? getWaypointStatuses(session, waypoints) : []),
    [session, waypoints],
  );

  const liveMetrics = useMemo((): LiveMetrics | null => {
    if (!liveRouteLeg || !liveGeometry) return null;

    const along = liveProgress?.distanceAlongMeters ?? 0;
    const { stepIndex, distanceToManeuverMeters } = locateStep(liveGeometry, along);

    return {
      // The maneuver at the end of the current step is the one to announce.
      upcomingStep: liveRouteLeg.steps[stepIndex + 1] ?? null,
      followingStep: liveRouteLeg.steps[stepIndex + 2] ?? null,
      distanceToManeuverMeters,
      remainingMeters: remainingLegMeters(liveGeometry, along),
      remainingSeconds: remainingLegSeconds(liveRouteLeg, liveGeometry, along),
    };
  }, [liveGeometry, liveProgress, liveRouteLeg]);

  const guidance = useMemo(
    () =>
      buildGuidance({
        rideState,
        phase,
        isPlaced,
        target: waypoints?.[targetIndex] ?? null,
        nextWaypoint: waypoints?.[targetIndex + 1] ?? null,
        leg: liveMetrics,
      }),
    [isPlaced, liveMetrics, phase, rideState, targetIndex, waypoints],
  );

  const currentLeg = useMemo((): { meters: number; seconds: number } | null => {
    if (liveMetrics) {
      return { meters: liveMetrics.remainingMeters, seconds: liveMetrics.remainingSeconds };
    }
    if (!standInLeg) return null;

    if (standInGeometry && standInProgress) {
      const along = standInProgress.distanceAlongMeters;
      return {
        meters: remainingLegMeters(standInGeometry, along),
        seconds: remainingLegSeconds(standInLeg, standInGeometry, along),
      };
    }

    return { meters: standInLeg.distanceMeters, seconds: standInLeg.durationSeconds };
  }, [liveMetrics, standInGeometry, standInLeg, standInProgress]);

  const summary = useMemo((): TripSummary => {
    if (!waypoints) return EMPTY_TRIP_SUMMARY;

    return summarizeTrip({
      waypoints,
      phase,
      isPlaced,
      targetIndex,
      currentLeg,
      laterLegs: plannedLegs ? laterLegs : null,
    });
  }, [currentLeg, isPlaced, laterLegs, phase, plannedLegs, targetIndex, waypoints]);

  const routeStatusLabel =
    liveLeg.status === "rerouting"
      ? "Re-routing to the fastest path"
      : liveLeg.isOffRoute
        ? "Off route — recalculating"
        : liveLeg.route?.source === "fallback"
          ? "Route unavailable — showing a straight line"
          : null;

  return {
    laterLegs,
    currentLegLine,
    waypointStatuses,
    guidance,
    summary,
    routeStatusLabel,
    isRouteLoading: liveLeg.status === "loading" || !isPlannedRouteSettled,
  };
};
