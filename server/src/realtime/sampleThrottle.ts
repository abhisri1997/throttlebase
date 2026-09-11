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

export interface SampleReservation {
  /** Hands the baseline back when the sample was not stored after all. */
  release: () => void;
}

export interface SampleThrottle {
  /**
   * Decides whether an update becomes a sample and, if so, records it as the
   * new baseline — in one synchronous step. Socket.IO runs the async location
   * handler for every update without waiting for the previous one, so a batch
   * of updates is in flight at once; deciding here, before any await, is what
   * lets each update see the ones reserved before it. Null means skip.
   */
  reserve: (key: string, point: TrackPoint) => SampleReservation | null;
  /** Forgets every baseline of a rider; keys end in `:<riderId>`. */
  clearRider: (riderId: string) => void;
}

export const createSampleThrottle = (): SampleThrottle => {
  const baselineByKey = new Map<string, TrackPoint>();

  return {
    reserve: (key, point) => {
      const previous = baselineByKey.get(key);
      if (!shouldPersistSample(previous, point)) return null;

      baselineByKey.set(key, point);

      return {
        release: () => {
          // A newer reservation has taken over since; leave it in place.
          if (baselineByKey.get(key) !== point) return;

          if (previous) baselineByKey.set(key, previous);
          else baselineByKey.delete(key);
        },
      };
    },

    clearRider: (riderId) => {
      for (const key of baselineByKey.keys()) {
        if (key.endsWith(`:${riderId}`)) baselineByKey.delete(key);
      }
    },
  };
};
