/**
 * Which live location updates to keep as track samples. Updates arrive every
 * few seconds — from the navigation screen and the background tracker alike —
 * but a ride history only needs a point per stretch of road, so a sample is
 * kept once the rider has moved far enough or enough time has passed.
 */
import { haversineMeters } from "../utils/polyline.js";

export const SAMPLE_MIN_DISTANCE_METERS = 20;
/** Even standing still, keep a point this often so the track's timing stays honest. */
export const SAMPLE_MAX_INTERVAL_MS = 30_000;

export interface TrackPoint {
  lat: number;
  lng: number;
  capturedAtMs: number;
}

export const shouldPersistSample = (
  previous: TrackPoint | undefined,
  next: TrackPoint,
): boolean => {
  if (!previous) return true;

  // A fix older than the last sample arrived late; the track already moved past it.
  if (next.capturedAtMs <= previous.capturedAtMs) return false;

  return (
    haversineMeters(previous, next) >= SAMPLE_MIN_DISTANCE_METERS ||
    next.capturedAtMs - previous.capturedAtMs >= SAMPLE_MAX_INTERVAL_MS
  );
};
