/**
 * Each rider's own ride, separate from the group's: a rider can start before
 * the captain rolls out and finish while the others are still riding.
 */

export type FinishReason = "arrived" | "left_early" | "group_ended";
export type RiderProgress = "not_started" | "riding" | FinishReason;

const STARTABLE_RIDE_STATUSES: ReadonlySet<string> = new Set(["scheduled", "active"]);

export interface FinishPosition {
  distanceToDestinationM: number | null;
  /**
   * The arrival state machine has them at the destination. It stays set while
   * they move around the venue, beyond the arrival radius itself.
   */
  hasArrived: boolean;
}

const isAtDestination = (position: FinishPosition, arriveRadiusM: number): boolean =>
  position.hasArrived ||
  (position.distanceToDestinationM !== null && position.distanceToDestinationM <= arriveRadiusM);

/** A rider finishing by hand: at the destination they arrived, anywhere else they left early. */
export const classifyManualFinish = (position: FinishPosition, arriveRadiusM: number): FinishReason =>
  // Without a destination or a known position there is nothing to have left early from.
  position.distanceToDestinationM === null || isAtDestination(position, arriveRadiusM)
    ? "arrived"
    : "left_early";

/** A rider still out when the captain ends the ride. */
export const classifyGroupEndFinish = (position: FinishPosition, arriveRadiusM: number): FinishReason =>
  isAtDestination(position, arriveRadiusM) ? "arrived" : "group_ended";

export interface StartOwnRideInput {
  rideStatus: string;
  scheduledAtMs: number | null;
  nowMs: number;
  earlyStartWindowMs: number;
}

export type StartOwnRideVerdict = { isAllowed: true } | { isAllowed: false; reason: string };

export const canStartOwnRide = ({
  rideStatus,
  scheduledAtMs,
  nowMs,
  earlyStartWindowMs,
}: StartOwnRideInput): StartOwnRideVerdict => {
  if (!STARTABLE_RIDE_STATUSES.has(rideStatus)) {
    return { isAllowed: false, reason: `A ${rideStatus} ride cannot be started` };
  }

  if (rideStatus === "active" || scheduledAtMs === null) {
    return { isAllowed: true };
  }

  const opensAtMs = scheduledAtMs - earlyStartWindowMs;
  if (nowMs < opensAtMs) {
    const minutes = Math.round(earlyStartWindowMs / 60_000);
    return {
      isAllowed: false,
      reason: `You can start this ride up to ${minutes} minutes before it is scheduled`,
    };
  }

  return { isAllowed: true };
};

export interface RiderProgressInput {
  rideStartedAt: string | null;
  finishedAt: string | null;
  finishReason: FinishReason | null;
}

export const deriveRiderProgress = ({
  rideStartedAt,
  finishedAt,
  finishReason,
}: RiderProgressInput): RiderProgress => {
  if (finishedAt !== null) return finishReason ?? "arrived";
  return rideStartedAt !== null ? "riding" : "not_started";
};
