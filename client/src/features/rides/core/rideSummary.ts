/**
 * The line on a finished ride for the rider who rode it: how far and how long
 * they rode, and how long they were stopped. Stops (where they got off, or
 * waited 5+ minutes beside the bike) are not riding; traffic and signals are.
 */
import { formatDistance, formatDuration } from "../../navigation/core/format";

export interface RidingSplit {
  ridingTimeS: number;
  ridingDistanceM: number;
  stoppedS: number;
}

export interface RideSummaryInput {
  /** The whole track, stops included: all an older server sends. */
  distanceMeters: number;
  durationSeconds: number;
  riding: RidingSplit | null;
}

export const rideSummaryLabel = (track: RideSummaryInput): string => {
  if (!track.riding) {
    return `You rode ${formatDistance(track.distanceMeters)} in ${formatDuration(track.durationSeconds)}`;
  }
  const rode = `You rode ${formatDistance(track.riding.ridingDistanceM)} in ${formatDuration(track.riding.ridingTimeS)}`;
  return track.riding.stoppedS > 0 ? `${rode} · stopped ${formatDuration(track.riding.stoppedS)}` : rode;
};
