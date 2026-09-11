/**
 * Which waypoint the rider is heading to, and which are done.
 *
 * A pure reducer driven by GPS fixes, modelled on how Google Maps runs a
 * multi-stop trip: entering a waypoint's arrival radius marks it reached, and
 * riding back out past the departure radius starts the next leg. The gap
 * between the two radii is deliberate hysteresis, so GPS jitter while parked
 * at a fuel pump can never bounce the leg back and forth.
 */
import { z } from "zod";
import type { LatLng } from "../types/navigation";
import { haversineMeters } from "./geometry";
import { DESTINATION_WAYPOINT_ID, type TripWaypoint } from "./tripPlan";

export const MIN_ARRIVAL_RADIUS_METERS = 60;
export const MAX_ARRIVAL_RADIUS_METERS = 120;
/** A fix accurate to ±40 m should not need to land within 60 m to count. */
const ACCURACY_RADIUS_FACTOR = 1.5;
export const DEPARTURE_RADIUS_METERS = 150;

export type NavigationPhase = "NAVIGATING" | "AT_WAYPOINT" | "FINISHED";

export interface NavigationSessionState {
  planKey: string;
  phase: NavigationPhase;
  /** Waypoint being ridden to (NAVIGATING) or waited at (AT_WAYPOINT). */
  targetIndex: number;
  /** Waypoint id → epoch ms at which the rider arrived. */
  reachedAt: Readonly<Record<string, number>>;
  skippedIds: readonly string[];
  /** False until the rider has been placed on the trip for the first time. */
  isPlaced: boolean;
}

export type NavigationSessionEvent =
  | { type: "PLACE"; targetIndex: number }
  | {
      type: "LOCATION";
      coordinate: LatLng;
      accuracyMeters?: number | null;
      timestamp: number;
    }
  | { type: "SKIP_TARGET" };

export const createInitialSession = (planKey: string): NavigationSessionState => ({
  planKey,
  phase: "NAVIGATING",
  targetIndex: 0,
  reachedAt: {},
  skippedIds: [],
  isPlaced: false,
});

export const arrivalRadiusMeters = (accuracyMeters?: number | null): number => {
  const fromAccuracy =
    typeof accuracyMeters === "number" && Number.isFinite(accuracyMeters)
      ? accuracyMeters * ACCURACY_RADIUS_FACTOR
      : 0;

  return Math.min(
    MAX_ARRIVAL_RADIUS_METERS,
    Math.max(MIN_ARRIVAL_RADIUS_METERS, fromAccuracy),
  );
};

const clampIndex = (index: number, waypoints: readonly TripWaypoint[]): number =>
  Math.min(Math.max(0, Math.trunc(index)), waypoints.length - 1);

/**
 * First waypoint from `fromIndex` onward that the rider is inside the arrival
 * radius of. Reaching a later stop before an earlier one skips the earlier one.
 * The destination is the exception: it only counts when it is the waypoint
 * being ridden to, because loop rides pass back through the start/finish area
 * mid-ride and must not end there early.
 */
const findArrivedIndex = (
  waypoints: readonly TripWaypoint[],
  fromIndex: number,
  coordinate: LatLng,
  radiusMeters: number,
): number | null => {
  const lastIndex = waypoints.length - 1;

  for (let index = fromIndex; index <= lastIndex; index += 1) {
    if (index === lastIndex && index !== fromIndex) continue;

    const waypoint = waypoints[index];
    if (waypoint && haversineMeters(coordinate, waypoint.coordinate) <= radiusMeters) {
      return index;
    }
  }

  return null;
};

/** Arrive at waypoints[index], marking anything between the current target and it as skipped. */
const arriveAt = (
  state: NavigationSessionState,
  waypoints: readonly TripWaypoint[],
  index: number,
  timestamp: number,
): NavigationSessionState => {
  const arrived = waypoints[index]!;
  const passedOver = waypoints
    .slice(state.targetIndex, index)
    .map((waypoint) => waypoint.id)
    .filter((id) => !(id in state.reachedAt) && !state.skippedIds.includes(id));

  return {
    ...state,
    phase: index >= waypoints.length - 1 ? "FINISHED" : "AT_WAYPOINT",
    targetIndex: index,
    reachedAt: { ...state.reachedAt, [arrived.id]: timestamp },
    skippedIds: [...state.skippedIds, ...passedOver],
  };
};

export const reduceNavigationSession = (
  state: NavigationSessionState,
  event: NavigationSessionEvent,
  waypoints: readonly TripWaypoint[],
): NavigationSessionState => {
  if (waypoints.length < 2) return state;

  const lastIndex = waypoints.length - 1;

  switch (event.type) {
    case "PLACE": {
      const targetIndex = clampIndex(event.targetIndex, waypoints);
      // Waypoints behind a rider joining mid-ride count as passed. Without
      // this, a later change of plan would reconcile them back in as targets
      // and send the rider back to the start.
      const passed = waypoints
        .slice(0, targetIndex)
        .map((waypoint) => waypoint.id)
        .filter((id) => !(id in state.reachedAt) && !state.skippedIds.includes(id));

      return {
        ...state,
        isPlaced: true,
        phase: "NAVIGATING",
        targetIndex,
        skippedIds: [...state.skippedIds, ...passed],
      };
    }

    case "SKIP_TARGET": {
      if (state.phase === "FINISHED") return state;

      if (state.phase === "AT_WAYPOINT") {
        return { ...state, phase: "NAVIGATING", targetIndex: state.targetIndex + 1 };
      }

      // There is nothing after the destination to skip ahead to.
      if (state.targetIndex >= lastIndex) return state;

      return {
        ...state,
        targetIndex: state.targetIndex + 1,
        skippedIds: [...state.skippedIds, waypoints[state.targetIndex]!.id],
      };
    }

    case "LOCATION": {
      if (!state.isPlaced || state.phase === "FINISHED") return state;

      const radius = arrivalRadiusMeters(event.accuracyMeters);

      if (state.phase === "NAVIGATING") {
        const arrivedIndex = findArrivedIndex(
          waypoints,
          state.targetIndex,
          event.coordinate,
          radius,
        );
        return arrivedIndex === null
          ? state
          : arriveAt(state, waypoints, arrivedIndex, event.timestamp);
      }

      // AT_WAYPOINT. Stops clustered within the departure radius of each other
      // are reached without ever "leaving" the previous one.
      const nextTarget = { ...state, targetIndex: state.targetIndex + 1 };
      const laterArrival = findArrivedIndex(
        waypoints,
        nextTarget.targetIndex,
        event.coordinate,
        radius,
      );
      if (laterArrival !== null) {
        return arriveAt(nextTarget, waypoints, laterArrival, event.timestamp);
      }

      const waitingAt = waypoints[state.targetIndex]!;
      if (haversineMeters(event.coordinate, waitingAt.coordinate) > DEPARTURE_RADIUS_METERS) {
        return { ...state, phase: "NAVIGATING", targetIndex: state.targetIndex + 1 };
      }

      return state;
    }
  }
};

/**
 * Carries progress across a change of plan — a stop approved, removed or moved
 * mid-ride. Waypoints already reached or skipped stay done; the rider heads to
 * the first waypoint that isn't.
 */
export const reconcileSessionWithPlan = (
  state: NavigationSessionState,
  waypoints: readonly TripWaypoint[],
  planKey: string,
): NavigationSessionState => {
  if (state.planKey === planKey) return state;

  const ids = new Set(waypoints.map((waypoint) => waypoint.id));
  const reachedAt = Object.fromEntries(
    Object.entries(state.reachedAt).filter(([id]) => ids.has(id)),
  );
  const skippedIds = state.skippedIds.filter((id) => ids.has(id));
  const base = { ...state, planKey, reachedAt, skippedIds };

  if (!state.isPlaced) return { ...base, phase: "NAVIGATING", targetIndex: 0 };

  if (DESTINATION_WAYPOINT_ID in reachedAt) {
    return { ...base, phase: "FINISHED", targetIndex: waypoints.length - 1 };
  }

  if (state.phase === "AT_WAYPOINT") {
    const [latestId] =
      Object.entries(reachedAt).sort(([, left], [, right]) => right - left)[0] ?? [];
    const waitingIndex = waypoints.findIndex((waypoint) => waypoint.id === latestId);
    if (waitingIndex !== -1) {
      return { ...base, phase: "AT_WAYPOINT", targetIndex: waitingIndex };
    }
  }

  const done = new Set([...Object.keys(reachedAt), ...skippedIds]);
  const nextIndex = waypoints.findIndex((waypoint) => !done.has(waypoint.id));

  return {
    ...base,
    phase: "NAVIGATING",
    targetIndex: nextIndex === -1 ? waypoints.length - 1 : nextIndex,
  };
};

export type WaypointStatus = "visited" | "next" | "upcoming";

/**
 * How each waypoint is shown on the map: done (reached or skipped), the one
 * being ridden to next, or still to come. Until the rider is placed on the
 * trip nothing is known, so every waypoint is upcoming.
 */
export const getWaypointStatuses = (
  state: NavigationSessionState | null,
  waypoints: readonly TripWaypoint[],
): WaypointStatus[] => {
  if (!state?.isPlaced) return waypoints.map(() => "upcoming");

  const isDone = (waypoint: TripWaypoint): boolean =>
    waypoint.id in state.reachedAt || state.skippedIds.includes(waypoint.id);

  // Waiting at a stop, the target itself is done and the one after it is next.
  const nextIndex =
    state.phase === "FINISHED"
      ? -1
      : waypoints.findIndex((waypoint, index) => index >= state.targetIndex && !isDone(waypoint));

  return waypoints.map((waypoint, index) => {
    if (isDone(waypoint)) return "visited";
    return index === nextIndex ? "next" : "upcoming";
  });
};

const PersistedSessionSchema = z.object({
  planKey: z.string(),
  phase: z.enum(["NAVIGATING", "AT_WAYPOINT", "FINISHED"]),
  targetIndex: z.number().int().min(0),
  reachedAt: z.record(z.string(), z.number()),
  skippedIds: z.array(z.string()),
  isPlaced: z.boolean(),
});

/**
 * Restores a session saved on the device. Anything unreadable starts afresh
 * rather than failing, and a session saved against an older plan is reconciled
 * with the current one.
 */
export const restoreSession = (
  raw: unknown,
  waypoints: readonly TripWaypoint[],
  planKey: string,
): NavigationSessionState => {
  const parsed = PersistedSessionSchema.safeParse(raw);
  if (!parsed.success) return createInitialSession(planKey);

  const restored = reconcileSessionWithPlan(parsed.data, waypoints, planKey);
  return { ...restored, targetIndex: clampIndex(restored.targetIndex, waypoints) };
};
