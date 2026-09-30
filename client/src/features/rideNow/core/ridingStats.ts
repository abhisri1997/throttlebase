/**
 * How a ride under way reads: on the live screen's sheet and on the ride bar
 * above the tabs (docs/ride-now-ux.md §4.3, §4.6).
 */
import { formatDuration } from "../../navigation/core/format";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;
/** Before this, an average is mostly the wait for the first fix. */
const MIN_SECONDS_FOR_AVERAGE = 60;

const safeSeconds = (seconds: number): number =>
  Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;

const safeKm = (km: number): number => (Number.isFinite(km) && km > 0 ? km : 0);

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** "1:12:40". */
export const formatRidingClock = (seconds: number): string => {
  const total = safeSeconds(seconds);
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${hours}:${twoDigits(minutes)}:${twoDigits(total % SECONDS_PER_MINUTE)}`;
};

/**
 * The server's elapsed time, run on by the phone's clock since it was read,
 * so the time ticks between polls.
 */
export const elapsedSecondsAt = (baseSeconds: number, readAtMs: number, nowMs: number): number =>
  safeSeconds(baseSeconds) + Math.max(0, Math.floor((nowMs - readAtMs) / MS_PER_SECOND));

/** "38.4 km". */
export const formatRiddenKm = (km: number): string => `${safeKm(km).toFixed(1)} km`;

export const averageSpeedKmh = (km: number, seconds: number): number | null => {
  const total = safeSeconds(seconds);
  if (total < MIN_SECONDS_FOR_AVERAGE) return null;
  return Math.round(safeKm(km) / (total / SECONDS_PER_HOUR));
};

/** "38.4 km ridden · 32 km/h avg". */
export const ridingDetailLine = (km: number, seconds: number): string => {
  const average = averageSpeedKmh(km, seconds);
  const ridden = `${formatRiddenKm(km)} ridden`;
  return average === null ? ridden : `${ridden} · ${average} km/h avg`;
};

/** "Riding · 1 hr 12 min · 38.4 km". */
export const ridingBarTitle = (seconds: number, km: number): string =>
  `Riding · ${formatDuration(safeSeconds(seconds))} · ${formatRiddenKm(km)}`;

/** "Morning ride · recording". */
export const ridingBarSubtitle = (title: string, isRecording: boolean): string =>
  `${title.trim() || "Your ride"} · ${isRecording ? "recording" : "not recording"}`;
