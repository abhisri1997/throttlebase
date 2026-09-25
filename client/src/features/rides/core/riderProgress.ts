/**
 * Each rider's own ride within a group ride, as the app shows it: who is
 * riding, who has arrived, who left early — the same for everyone in the group.
 */
import { formatDistance, formatDuration } from "../../navigation/core/format";

export type RiderProgress = "not_started" | "riding" | "arrived" | "left_early" | "group_ended";
export type FinishReason = Extract<RiderProgress, "arrived" | "left_early" | "group_ended">;

/**
 * Mirrors the server's default arrival radius. Only used to preview which way
 * a finish will go; the server decides.
 */
const ARRIVE_RADIUS_METERS = 150;

const FINISHED: ReadonlySet<RiderProgress> = new Set(["arrived", "left_early", "group_ended"]);

export const isFinishedProgress = (progress: RiderProgress): boolean => FINISHED.has(progress);

export interface ProgressLabelInput {
  progress: RiderProgress;
  finishedAt: string | null;
  isOnline: boolean;
}

/** "Riding", "Offline", "Arrived 5:42 PM", "Left early", "Ended by captain", "Not started". */
export const progressLabel = (
  { progress, finishedAt, isOnline }: ProgressLabelInput,
  formatClock: (epochMs: number) => string,
): string => {
  switch (progress) {
    case "arrived":
      return finishedAt ? `Arrived ${formatClock(Date.parse(finishedAt))}` : "Arrived";
    case "left_early":
      return "Left early";
    case "group_ended":
      return "Ended by captain";
    case "riding":
      return isOnline ? "Riding" : "Offline";
    default:
      return "Not started";
  }
};

export interface FinishPreviewInput {
  distanceToDestinationMeters: number | null;
  /** The server has them at the destination — stays set while they move around the venue. */
  hasArrived: boolean;
}

/** Which way finishing now would go, so the rider can be told before confirming. */
export const previewFinishReason = ({
  distanceToDestinationMeters,
  hasArrived,
}: FinishPreviewInput): "arrived" | "left_early" =>
  hasArrived ||
  distanceToDestinationMeters === null ||
  distanceToDestinationMeters <= ARRIVE_RADIUS_METERS
    ? "arrived"
    : "left_early";

export interface UnfinishedRider {
  displayName: string;
  isOnline: boolean;
  lastHeartbeatAt: string | null;
  distanceToDestinationMeters: number | null;
}

/** One line per rider still out, for the captain deciding whether to end the ride. */
export const describeUnfinishedRider = (rider: UnfinishedRider, nowMs: number): string => {
  const distance =
    rider.distanceToDestinationMeters === null
      ? null
      : formatDistance(rider.distanceToDestinationMeters);

  if (!rider.isOnline) {
    const quietFor = rider.lastHeartbeatAt
      ? ` ${formatDuration((nowMs - Date.parse(rider.lastHeartbeatAt)) / 1000)}`
      : "";
    return distance
      ? `${rider.displayName} — offline${quietFor}, last seen ${distance} away`
      : `${rider.displayName} — offline${quietFor}`;
  }

  return distance ? `${rider.displayName} — ${distance} away` : `${rider.displayName} — still riding`;
};

/** Time left before the server finishes a rider parked at the destination. */
export const autoFinishRemainingMs = (
  arrivedAtMs: number,
  autoFinishAfterMs: number,
  nowMs: number,
): number => Math.max(0, arrivedAtMs + autoFinishAfterMs - nowMs);
