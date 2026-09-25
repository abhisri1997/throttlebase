/**
 * The crew sheet shows the current rider apart, as their own "You" card, and
 * the rest of the crew ordered so the riders someone might need to find come
 * first: still out, then finished, then not yet started.
 */
import type { RideParticipantView } from "../types/navigation";

const PROGRESS_ORDER: Readonly<Record<RideParticipantView["progress"], number>> = {
  riding: 0,
  arrived: 1,
  left_early: 1,
  group_ended: 1,
  not_started: 2,
};

const byRelevance = (left: RideParticipantView, right: RideParticipantView): number =>
  PROGRESS_ORDER[left.progress] - PROGRESS_ORDER[right.progress] ||
  left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });

export interface CrewSplit {
  /** The current rider, if they are in the crew. */
  self: RideParticipantView | null;
  others: RideParticipantView[];
}

export const splitCrew = (
  participants: readonly RideParticipantView[],
  currentRiderId: string | undefined,
): CrewSplit => ({
  self: participants.find((participant) => participant.riderId === currentRiderId) ?? null,
  others: participants
    .filter((participant) => participant.riderId !== currentRiderId)
    .sort(byRelevance),
});
