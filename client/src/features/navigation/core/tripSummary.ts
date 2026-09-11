/**
 * The trip bar's numbers, as Google Maps shows them: time and distance to the
 * next waypoint, and the arrival time at the end of the whole ride.
 */
import type { RouteLeg } from "../types/navigation";
import { waypointLabel } from "./guidance";
import type { NavigationPhase } from "./navigationSession";
import type { TripWaypoint } from "./tripPlan";

export interface TripSummaryInput {
  waypoints: readonly TripWaypoint[];
  phase: NavigationPhase;
  isPlaced: boolean;
  targetIndex: number;
  /** What is left of the leg being ridden; null while it isn't known yet. */
  currentLeg: { meters: number; seconds: number } | null;
  /** Planned legs after the current one; null while the planned route is unavailable. */
  laterLegs: readonly RouteLeg[] | null;
}

export interface TripSummary {
  toNextMeters: number | null;
  toNextSeconds: number | null;
  nextLabel: string | null;
  /** Seconds to the end of the ride, for the final arrival time. */
  totalSeconds: number | null;
}

export const EMPTY_TRIP_SUMMARY: TripSummary = {
  toNextMeters: null,
  toNextSeconds: null,
  nextLabel: null,
  totalSeconds: null,
};

const sum = (legs: readonly RouteLeg[], pick: (leg: RouteLeg) => number): number =>
  legs.reduce((total, leg) => total + pick(leg), 0);

export const summarizeTrip = ({
  waypoints,
  phase,
  isPlaced,
  targetIndex,
  currentLeg,
  laterLegs,
}: TripSummaryInput): TripSummary => {
  if (phase === "FINISHED" || waypoints.length < 2) return EMPTY_TRIP_SUMMARY;

  const laterMeters = laterLegs ? sum(laterLegs, (leg) => leg.distanceMeters) : null;
  const laterSeconds = laterLegs ? sum(laterLegs, (leg) => leg.durationSeconds) : null;

  // Before the rider is placed, the whole ride is still ahead.
  if (!isPlaced) {
    return {
      toNextMeters: laterMeters,
      toNextSeconds: laterSeconds,
      nextLabel: waypointLabel(waypoints[waypoints.length - 1]!),
      totalSeconds: laterSeconds,
    };
  }

  // Waiting at a stop, the next waypoint is the one after it.
  const next = waypoints[phase === "AT_WAYPOINT" ? targetIndex + 1 : targetIndex] ?? null;

  return {
    toNextMeters: currentLeg?.meters ?? null,
    toNextSeconds: currentLeg?.seconds ?? null,
    nextLabel: next ? waypointLabel(next) : null,
    totalSeconds: currentLeg && laterSeconds !== null ? currentLeg.seconds + laterSeconds : null,
  };
};
