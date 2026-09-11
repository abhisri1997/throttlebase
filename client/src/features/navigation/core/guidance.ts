/**
 * What the maneuver banner says, for every state of a ride: previewing,
 * finding the rider, riding a leg, waiting at a stop, finished.
 */
import type { NavigationStep } from "../types/navigation";
import { maneuverIconKind, type ManeuverIconKind } from "./maneuver";
import type { NavigationPhase } from "./navigationSession";
import type { TripWaypoint } from "./tripPlan";

/** The maneuver after next is previewed only when it follows this closely, as in Google Maps. */
export const THEN_PREVIEW_MAX_METERS = 400;

export type RideState = "NOT_STARTED" | "ACTIVE" | "COMPLETED";

export interface LegGuidanceInput {
  /** Step whose maneuver comes next; null on the last step of the leg. */
  upcomingStep: NavigationStep | null;
  /** Step after that; null when the upcoming maneuver is the last one. */
  followingStep: NavigationStep | null;
  distanceToManeuverMeters: number;
}

export interface GuidanceInput {
  rideState: RideState;
  phase: NavigationPhase;
  isPlaced: boolean;
  /** Waypoint being ridden to (NAVIGATING) or waited at (AT_WAYPOINT). */
  target: TripWaypoint | null;
  /** Waypoint after the target. */
  nextWaypoint: TripWaypoint | null;
  /** Null until the live leg has loaded. */
  leg: LegGuidanceInput | null;
}

export interface Guidance {
  icon: ManeuverIconKind;
  headline: string;
  detail: string | null;
  note: string | null;
  /** Metres to the maneuver; null when there is nothing to count down to. */
  distanceMeters: number | null;
  thenIcon: ManeuverIconKind | null;
}

export const waypointLabel = (waypoint: TripWaypoint): string =>
  waypoint.kind === "stop" && waypoint.stopNumber
    ? `Stop ${waypoint.stopNumber} · ${waypoint.name}`
    : waypoint.name;

const statusOnly = (icon: ManeuverIconKind, headline: string, detail: string | null): Guidance => ({
  icon,
  headline,
  detail,
  note: null,
  distanceMeters: null,
  thenIcon: null,
});

const stepGuidance = (leg: LegGuidanceInput, step: NavigationStep): Guidance => {
  const roadName = step.roadName?.trim() || null;
  const showThen = step.distanceMeters <= THEN_PREVIEW_MAX_METERS;

  return {
    icon: maneuverIconKind(step.maneuver),
    // The road is what a rider looks for on signs; the instruction explains it.
    headline: roadName ?? step.instruction,
    detail: roadName ? step.instruction : null,
    note: step.note?.trim() || null,
    distanceMeters: leg.distanceToManeuverMeters,
    thenIcon: showThen
      ? leg.followingStep
        ? maneuverIconKind(leg.followingStep.maneuver)
        : "arrive"
      : null,
  };
};

export const buildGuidance = ({
  rideState,
  phase,
  isPlaced,
  target,
  nextWaypoint,
  leg,
}: GuidanceInput): Guidance => {
  if (rideState === "COMPLETED" || phase === "FINISHED") {
    return statusOnly("arrive", "Ride completed", target ? `You've reached ${target.name}` : null);
  }

  if (rideState === "NOT_STARTED") {
    return statusOnly("depart", "Route preview", "Guidance starts when the ride does");
  }

  if (!isPlaced || !target) {
    return statusOnly("depart", "Finding your position", "Waiting for GPS");
  }

  if (phase === "AT_WAYPOINT") {
    return statusOnly(
      "arrive",
      `Arrived at ${waypointLabel(target)}`,
      nextWaypoint ? `Ride on to head to ${waypointLabel(nextWaypoint)}` : null,
    );
  }

  if (!leg) {
    return statusOnly("straight", `Head to ${waypointLabel(target)}`, null);
  }

  if (!leg.upcomingStep) {
    return {
      ...statusOnly("arrive", waypointLabel(target), "Arriving"),
      distanceMeters: leg.distanceToManeuverMeters,
    };
  }

  return stepGuidance(leg, leg.upcomingStep);
};
