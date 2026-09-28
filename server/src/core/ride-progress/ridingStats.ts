/**
 * A rider's stats for one ride, from the riding alone: stops, and any walking
 * at them, are neither distance nor riding time, and a phone's odd fast fix
 * while its owner walks is never a top speed.
 */
import { MAX_PLAUSIBLE_SPEED_MPS, type TrackSample } from "../../utils/track.js";
import { segmentRide } from "./segmentRide.js";

export interface RidingStats {
  distanceKm: number;
  ridingTimeS: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
}

const MAX_PLAUSIBLE_KMH = MAX_PLAUSIBLE_SPEED_MPS * 3.6;

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

export const ridingStats = (samples: readonly TrackSample[]): RidingStats => {
  const ride = segmentRide(samples);
  const distanceKm = ride.ridingDistanceM / 1000;
  const readings = ride.riding
    .flat()
    .map((sample) => sample.speedKmh)
    .filter((kmh): kmh is number => typeof kmh === "number" && Number.isFinite(kmh) && kmh <= MAX_PLAUSIBLE_KMH);

  return {
    distanceKm: roundTo2(distanceKm),
    ridingTimeS: ride.ridingTimeS,
    avgSpeedKmh: ride.ridingTimeS > 0 ? roundTo2(distanceKm / (ride.ridingTimeS / 3600)) : 0,
    maxSpeedKmh: readings.length > 0 ? roundTo2(Math.max(...readings)) : 0,
  };
};
