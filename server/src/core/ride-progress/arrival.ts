/**
 * Whether a rider has arrived at the ride's destination, fix by fix.
 *
 * Two radii give the decision hysteresis: a rider arrives on entering the
 * inner one and only stops counting as arrived on leaving the outer one, so
 * parking, walking round the venue or looping the block does not reset the
 * clock. Arrival only arms once the rider has been beyond the outer radius —
 * on a round trip everyone starts at the destination and must not "arrive"
 * before setting off.
 *
 * The inner radius follows the fix's accuracy, as the app's navigation does:
 * with good GPS a rider arrives within about 50 m, not 150 m, which in a city
 * is a street or two away. And they must have slowed down: riding past the
 * destination, or up to it at speed, is not arriving.
 */

export interface ArrivalConfig {
  /** The widest the arrival radius gets, for a fix of poor accuracy. */
  arriveRadiusM: number;
  /** The arrival radius for an accurate fix. */
  arriveMinRadiusM: number;
  leaveRadiusM: number;
  /** Fixes less accurate than this cannot move a rider in or out. */
  maxAccuracyM: number;
  /** Faster than this, a rider is passing through, not arriving. */
  maxArriveSpeedKmh: number;
}

/** The arrival radius scales with the fix's accuracy, as the app's navigation's does. */
const ACCURACY_RADIUS_FACTOR = 1.5;

export const arrivalRadiusFor = (accuracyM: number | null, config: ArrivalConfig): number =>
  Math.min(
    config.arriveRadiusM,
    Math.max(config.arriveMinRadiusM, (accuracyM ?? 0) * ACCURACY_RADIUS_FACTOR),
  );

export interface ArrivalState {
  isArmed: boolean;
  /** When the rider entered the arrival radius; null while not arrived. */
  arrivedAtMs: number | null;
}

export interface ArrivalFix {
  distanceToDestinationM: number;
  accuracyM: number | null;
  /** Null when the device didn't report it; then only distance decides. */
  speedKmh?: number | null;
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

  const isInside = fix.distanceToDestinationM <= arrivalRadiusFor(fix.accuracyM, config);
  const hasSlowed = fix.speedKmh === null || fix.speedKmh === undefined || fix.speedKmh <= config.maxArriveSpeedKmh;
  if (isInside && hasSlowed && state.isArmed && state.arrivedAtMs === null) {
    return { state: { isArmed: true, arrivedAtMs: fix.capturedAtMs }, transition: "arrived" };
  }

  return unchanged;
};
