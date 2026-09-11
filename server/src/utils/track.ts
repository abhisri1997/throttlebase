/**
 * A rider's travelled track, built from their live location samples: cleaned
 * of GPS noise, measured, and encoded for the map.
 */
import { encodePolyline, haversineMeters, type LatLng } from "./polyline.js";

/** Fixes less accurate than this are more likely to draw a spike than a road. */
export const MAX_TRACK_ACCURACY_METERS = 50;
/** Faster than any motorcycle on a public road; a jump this quick is a bad fix. */
export const MAX_PLAUSIBLE_SPEED_MPS = 250 / 3.6;

export interface TrackSample extends LatLng {
  accuracyM: number | null;
  capturedAtMs: number;
}

export interface RiderTrack {
  encodedPolyline: string;
  pointCount: number;
  distanceMeters: number;
  /** First to last sample, stops included. */
  durationSeconds: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
}

const isUsable = (sample: TrackSample): boolean =>
  Number.isFinite(sample.lat) &&
  Number.isFinite(sample.lng) &&
  Number.isFinite(sample.capturedAtMs) &&
  (sample.accuracyM === null || sample.accuracyM <= MAX_TRACK_ACCURACY_METERS);

const impliedSpeedMps = (from: TrackSample, to: TrackSample): number => {
  const seconds = (to.capturedAtMs - from.capturedAtMs) / 1000;
  return seconds > 0 ? haversineMeters(from, to) / seconds : Number.POSITIVE_INFINITY;
};

/** In time order, one sample per timestamp, without inaccurate fixes. */
const orderedUsableSamples = (samples: readonly TrackSample[]): TrackSample[] => {
  const sorted = samples.filter(isUsable).sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  return sorted.filter(
    (sample, index) => index === 0 || sample.capturedAtMs !== sorted[index - 1]!.capturedAtMs,
  );
};

/**
 * Drops GPS spikes: fixes implausibly far from the fix before them and the fix
 * after them. A jump the following fixes agree with is kept — that is the
 * rider reappearing after a gap (a tunnel, the app backgrounded), not noise.
 * With only one neighbour, that neighbour decides.
 */
export const cleanTrack = (samples: readonly TrackSample[]): TrackSample[] => {
  const ordered = orderedUsableSamples(samples);
  const kept: TrackSample[] = [];

  ordered.forEach((sample, index) => {
    const previous = kept[kept.length - 1];
    const next = ordered[index + 1];
    const isFarFromPrevious = previous
      ? impliedSpeedMps(previous, sample) > MAX_PLAUSIBLE_SPEED_MPS
      : false;
    const isFarFromNext = next ? impliedSpeedMps(sample, next) > MAX_PLAUSIBLE_SPEED_MPS : false;

    const isSpike =
      previous && next ? isFarFromPrevious && isFarFromNext : isFarFromPrevious || isFarFromNext;

    if (!isSpike) kept.push(sample);
  });

  return kept;
};

export const buildTrack = (samples: readonly TrackSample[]): RiderTrack => {
  const points = cleanTrack(samples);
  const first = points[0];
  const last = points[points.length - 1];

  const distanceMeters = points.reduce(
    (total, point, index) => (index === 0 ? total : total + haversineMeters(points[index - 1]!, point)),
    0,
  );

  return {
    encodedPolyline: encodePolyline(points.map(({ lat, lng }) => ({ lat, lng }))),
    pointCount: points.length,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: first && last ? Math.round((last.capturedAtMs - first.capturedAtMs) / 1000) : 0,
    startedAtMs: first?.capturedAtMs ?? null,
    endedAtMs: last?.capturedAtMs ?? null,
  };
};
