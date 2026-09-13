/**
 * Drives navigation as if the rider were moving along a route, without a real
 * GPS fix. Lets leg transitions, camera behaviour, and guidance be watched on
 * a stationary device instead of requiring an actual ride. Dev tooling only.
 */
import type { LatLng, NavigationFix } from "../types/navigation";
import { bearingDegrees, cumulativeDistances, haversineMeters } from "./geometry";

/** A bike's typical cruising speed, in m/s (~43 km/h). */
const DEFAULT_SPEED_MPS = 12;
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_ACCURACY_METERS = 8;
/** How far ahead of the sample to look when computing heading. */
const HEADING_LOOKAHEAD_METERS = 1;

/** The point `distanceMeters` along a polyline, clamped to its ends. */
export const pointAtDistance = (
  polyline: readonly LatLng[],
  cumulative: readonly number[],
  distanceMeters: number,
): LatLng => {
  const lastIndex = polyline.length - 1;
  if (lastIndex < 0) throw new Error("pointAtDistance: empty polyline");
  if (distanceMeters <= 0) return polyline[0]!;

  const totalLength = cumulative[lastIndex] ?? 0;
  if (distanceMeters >= totalLength) return polyline[lastIndex]!;

  const segmentEndIndex = cumulative.findIndex((along) => along >= distanceMeters);
  const index = Math.max(0, segmentEndIndex - 1);
  const start = polyline[index]!;
  const end = polyline[index + 1] ?? start;
  const segmentStart = cumulative[index] ?? 0;
  const segmentLength = (cumulative[index + 1] ?? segmentStart) - segmentStart;
  const ratio = segmentLength > 0 ? (distanceMeters - segmentStart) / segmentLength : 0;

  return {
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio,
  };
};

export interface SimulatedTraceOptions {
  speedMps?: number;
  sampleIntervalMs?: number;
  startTimestamp?: number;
  accuracyMeters?: number;
}

/**
 * A fix trace that rides the whole polyline at a constant speed, one sample
 * per `sampleIntervalMs`, ending with a fix sitting at the final point.
 */
export const buildSimulatedFixes = (
  polyline: readonly LatLng[],
  options: SimulatedTraceOptions = {},
): NavigationFix[] => {
  if (polyline.length < 2) return [];

  const speedMps = options.speedMps ?? DEFAULT_SPEED_MPS;
  const sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const startTimestamp = options.startTimestamp ?? Date.now();
  const accuracyMeters = options.accuracyMeters ?? DEFAULT_ACCURACY_METERS;

  const cumulative = cumulativeDistances(polyline);
  const totalLength = cumulative[cumulative.length - 1] ?? 0;
  const stepMeters = speedMps * (sampleIntervalMs / 1000);
  const sampleCount = stepMeters > 0 ? Math.ceil(totalLength / stepMeters) + 1 : 1;

  const fixes: NavigationFix[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const distanceMeters = Math.min(totalLength, i * stepMeters);
    const coordinate = pointAtDistance(polyline, cumulative, distanceMeters);
    const ahead = pointAtDistance(
      polyline,
      cumulative,
      Math.min(totalLength, distanceMeters + HEADING_LOOKAHEAD_METERS),
    );
    const headingDegrees =
      haversineMeters(coordinate, ahead) > 0 ? bearingDegrees(coordinate, ahead) : null;

    fixes.push({
      coordinate,
      accuracyMeters,
      headingDegrees,
      speedMps,
      timestamp: startTimestamp + i * sampleIntervalMs,
    });
  }

  return fixes;
};
