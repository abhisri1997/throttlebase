/**
 * Distances and times as turn-by-turn navigation shows them: rounded to steps
 * a rider can take in at a glance, never to the metre.
 */

const METERS_PER_KM = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

/** "40 m", "350 m", "4.4 km", "23 km". */
export const formatDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) return "--";

  if (meters < 100) return `${roundTo(meters, 10)} m`;

  const nearestFifty = roundTo(meters, 50);
  if (nearestFifty < METERS_PER_KM) return `${nearestFifty} m`;

  const km = meters / METERS_PER_KM;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
};

/** "1 min", "12 min", "1 hr", "2 hr 5 min". Anything under a minute still reads as 1 min. */
export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";

  const totalMinutes = Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE));
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
};

/** Wall-clock time, e.g. "4:58 PM", in the device's locale. */
export const formatClockTime = (epochMs: number): string => {
  if (!Number.isFinite(epochMs)) return "--";

  return new Date(epochMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/** Wall-clock arrival time after `secondsFromNow`. */
export const formatArrivalTime = (secondsFromNow: number, nowMs: number): string => {
  if (!Number.isFinite(secondsFromNow) || secondsFromNow < 0) return "--";

  return formatClockTime(nowMs + secondsFromNow * 1000);
};
