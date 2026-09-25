/**
 * Tunables for per-rider ride progress. Every one can be overridden from the
 * environment — a shorter auto-finish dwell makes simulated test rides quick.
 */
import type { ArrivalConfig } from "./arrival.js";

const MINUTE_MS = 60_000;

const readPositiveNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[ride-progress] Ignoring invalid ${name}="${raw}"; using ${fallback}.`);
    return fallback;
  }
  return value;
};

export interface RideProgressConfig {
  arrival: ArrivalConfig;
  /** How long before the scheduled time a rider may start their own ride. */
  earlyStartWindowMs: number;
  /** How long a rider stays at the destination before their ride finishes itself. */
  autoFinishDwellMs: number;
  /** How long a live ride may go without any riding rider reporting before it ends itself. */
  idleAutoEndMs: number;
}

export const RIDE_PROGRESS_CONFIG: RideProgressConfig = {
  arrival: {
    arriveRadiusM: readPositiveNumber("RIDE_ARRIVAL_RADIUS_M", 150),
    leaveRadiusM: readPositiveNumber("RIDE_ARRIVAL_EXIT_RADIUS_M", 300),
    maxAccuracyM: readPositiveNumber("RIDE_ARRIVAL_MAX_ACCURACY_M", 100),
  },
  earlyStartWindowMs: readPositiveNumber("RIDE_EARLY_START_WINDOW_MIN", 60) * MINUTE_MS,
  autoFinishDwellMs: readPositiveNumber("RIDE_AUTO_FINISH_DWELL_MIN", 10) * MINUTE_MS,
  idleAutoEndMs: readPositiveNumber("RIDE_IDLE_AUTO_END_MIN", 120) * MINUTE_MS,
};
