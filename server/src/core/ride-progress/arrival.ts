/**
 * Whether a rider has arrived at the ride's destination, fix by fix.
 *
 * Two radii give the decision hysteresis: a rider arrives on entering the
 * inner one and only stops counting as arrived on leaving the outer one, so
 * parking, walking round the venue or looping the block does not reset the
 * clock. Arrival only arms once the rider has been beyond the outer radius —
 * on a round trip everyone starts at the destination and must not "arrive"
 * before setting off.
 */

export interface ArrivalConfig {
  arriveRadiusM: number;
  leaveRadiusM: number;
  /** Fixes less accurate than this cannot move a rider in or out. */
  maxAccuracyM: number;
}

export interface ArrivalState {
  isArmed: boolean;
  /** When the rider entered the arrival radius; null while not arrived. */
  arrivedAtMs: number | null;
}

export interface ArrivalFix {
  distanceToDestinationM: number;
  accuracyM: number | null;
  capturedAtMs: number;
}

export type ArrivalTransition = "none" | "armed" | "arrived" | "left";

export interface ArrivalStep {
  state: ArrivalState;
  transition: ArrivalTransition;
}

export const INITIAL_ARRIVAL_STATE: ArrivalState = { isArmed: false, arrivedAtMs: null };

export const nextArrivalState = (
  state: ArrivalState,
  fix: ArrivalFix,
  config: ArrivalConfig,
): ArrivalStep => {
  const unchanged: ArrivalStep = { state, transition: "none" };

  if (fix.accuracyM !== null && fix.accuracyM > config.maxAccuracyM) {
    return unchanged;
  }

  if (fix.distanceToDestinationM > config.leaveRadiusM) {
    if (state.arrivedAtMs !== null) {
      return { state: { isArmed: true, arrivedAtMs: null }, transition: "left" };
    }
    if (!state.isArmed) {
      return { state: { isArmed: true, arrivedAtMs: null }, transition: "armed" };
    }
    return unchanged;
  }

  const isInside = fix.distanceToDestinationM <= config.arriveRadiusM;
  if (isInside && state.isArmed && state.arrivedAtMs === null) {
    return { state: { isArmed: true, arrivedAtMs: fix.capturedAtMs }, transition: "arrived" };
  }

  return unchanged;
};
