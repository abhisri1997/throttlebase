/**
 * The numbers on the screen a rider sees when their ride ends: how far, how
 * long they rode, how long they were stopped, and their average speed while
 * moving. Stops don't count against the average; traffic and signals do.
 */
import { formatDistance, formatDuration } from "../../navigation/core/format";
import type { RideSummaryInput } from "./rideSummary";

export interface RideStat {
  label: string;
  value: string;
}

/** km/h, one decimal below 10, whole above; null when nothing was ridden. */
const formatSpeed = (metres: number, seconds: number): string | null => {
  if (seconds <= 0 || metres <= 0) return null;
  const kmh = (metres / seconds) * 3.6;
  return `${kmh < 10 ? kmh.toFixed(1) : Math.round(kmh)} km/h`;
};

export const rideStats = (track: RideSummaryInput): RideStat[] => {
  const distance = track.riding?.ridingDistanceM ?? track.distanceMeters;
  const riding = track.riding?.ridingTimeS ?? track.durationSeconds;
  const stats: RideStat[] = [
    { label: "Distance", value: formatDistance(distance) },
    { label: "Riding time", value: formatDuration(riding) },
  ];

  const average = formatSpeed(distance, riding);
  if (average) stats.push({ label: "Average speed", value: average });

  if (track.riding && track.riding.stoppedS > 0) {
    stats.push({ label: "Stopped", value: formatDuration(track.riding.stoppedS) });
  }
  if (track.riding) {
    stats.push({ label: "Total time", value: formatDuration(track.durationSeconds) });
  }
  return stats;
};

/** Too little was recorded to show a ride worth the name. */
export const isTrackTooShort = (track: RideSummaryInput & { coordinates: readonly unknown[] }): boolean =>
  track.coordinates.length < 2 || track.distanceMeters < 50;
