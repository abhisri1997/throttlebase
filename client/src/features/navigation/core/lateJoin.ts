/**
 * Joining a ride that has already set off.
 *
 * A rider who opens navigation late has two sensible choices: ride the planned
 * route from the start, or head straight for the group. Which one is right
 * depends on how far the group has actually got — chasing them is pointless
 * while they are still in the car park, and riding back to the start is
 * pointless once they are an hour down the road.
 */
import type { LatLng } from "../types/navigation";
import { haversineMeters } from "./geometry";
import { placeRiderOnTrip, type TripGeometry } from "./routeProgress";

/** Closer than this to the start and there is nothing to catch up on. */
export const LATE_JOIN_MIN_DISTANCE_METERS = 300;

/**
 * The waypoint the group as a whole is heading to — the furthest along any of
 * them has reached, so a straggler is never sent to a waypoint the leaders
 * are already past.
 */
export const groupTargetIndex = (
  positions: readonly LatLng[],
  trip: TripGeometry,
): number =>
  positions.reduce(
    (furthest, position) => Math.max(furthest, placeRiderOnTrip(position, trip)),
    0,
  );

export interface CatchUpOfferInput {
  riderCoordinate: LatLng;
  start: LatLng;
  /** Where the group is heading; 0 means they have not left the start. */
  groupTargetIndex: number;
  minDistanceMeters?: number;
}

/**
 * Whether to ask the rider how they want to join. Only worth asking once the
 * group has actually left the start and the rider is not already there —
 * otherwise both answers lead to the same place.
 */
export const shouldOfferCatchUp = ({
  riderCoordinate,
  start,
  groupTargetIndex: groupIndex,
  minDistanceMeters = LATE_JOIN_MIN_DISTANCE_METERS,
}: CatchUpOfferInput): boolean =>
  groupIndex > 0 && haversineMeters(riderCoordinate, start) > minDistanceMeters;
