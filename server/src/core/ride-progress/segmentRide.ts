/**
 * A rider's track split into riding and stops.
 *
 * A stop is where the rider got off: riding ends at a spot, minutes pass, and
 * riding starts again from that same spot. A jam is not a stop, however long,
 * because the rider carries on from further along the road. Time and distance
 * on foot at a stop (walking into a campus where bikes aren't allowed, say)
 * are neither ridden time nor ridden road.
 *
 * Riding is told from walking by sustained speed: a phone indoors reads the
 * odd fast fix while its owner walks, so one fast fix never counts as riding.
 *
 * Where the phone's motion sensors said what the rider was doing, that is
 * extra evidence about a pause in riding; without readings, GPS decides alone.
 *   - Walking (or running) during the pause: the rider got off. They walked
 *     away even if GPS barely moved (indoors, say), and the pause is a stop
 *     if they came back to where they parked, even if not to the exact spot.
 *   - Only automotive or cycling during the pause, with a reading every couple
 *     of minutes: the rider stayed on the bike in traffic, so it is riding,
 *     however long it lasted.
 *   - Anything else (standing still, a mix without enough walking) says
 *     nothing either way.
 */
import { haversineMeters, type LatLng } from "../../utils/polyline.js";
import { cleanTrack, MAX_PLAUSIBLE_SPEED_MPS, type MotionActivity, type TrackSample } from "../../utils/track.js";

/** Faster than anyone walks... */
export const RIDING_KMH = 12;
/** ...for at least this long, and the rider is on the bike. */
export const RIDING_SUSTAINED_S = 30;
/** Slower than this is walking pace, or standing. */
export const WALKING_MAX_KMH = 8;
/** Shorter than this (a signal, a stretch) is part of the ride. */
export const STOP_MIN_S = 5 * 60;
/** Riding resumed within this of where it ended: the rider came back to the bike. */
export const STOP_RETURN_M = 50;
/** Fixes this soon after riding ends are the rider parking: any of them may be the bike. */
const PARKING_WINDOW_S = 90;
/** Further than this from the bike, the rider walked off somewhere. */
export const WALKED_AWAY_M = 75;
/** Fewer walking readings than this could be the rider shifting about on the bike. */
export const ON_FOOT_MIN_READINGS = 2;
/**
 * Longer than this without a reading and the rider could have got off and back
 * on unseen: the phone records nothing while the bike stands still.
 */
export const ON_BIKE_MAX_UNHEARD_S = 2 * 60;
/** A planned stop the rider came this close to on foot is the one they stopped for... */
const PLANNED_STOP_REACHED_M = 150;
/** ...or one they parked this close to. */
const PLANNED_STOP_PARKED_M = 300;

export interface PlannedStopPoint extends LatLng {
  id: string;
}

export interface RideStop {
  /** Where the bike was: the stop, as far as the road is concerned. */
  parkedAt: LatLng;
  startedAtMs: number;
  endedAtMs: number;
  durationS: number;
  /** How far the rider went from the bike. */
  farthestM: number;
  /** Went far from the bike, or the phone felt them walking. */
  walkedAway: boolean;
  /** The planned stop this was, or null for one the rider found. */
  plannedStopId: string | null;
}

export interface SegmentedRide {
  /** Riding stretches in order; a stop lies between each pair. */
  riding: TrackSample[][];
  stops: RideStop[];
  ridingTimeS: number;
  ridingDistanceM: number;
}

interface Span {
  first: number;
  last: number;
}

const secondsBetween = (from: TrackSample, to: TrackSample): number => (to.capturedAtMs - from.capturedAtMs) / 1000;

/**
 * Speed over the step into this fix, from the fixes themselves. The first fix
 * has no step into it, so it takes the step out of it.
 */
const stepKmh = (points: readonly TrackSample[], index: number): number => {
  const [from, to] = index === 0 ? [points[0], points[1]] : [points[index - 1], points[index]];
  if (!from || !to) return 0;
  const seconds = secondsBetween(from, to);
  return seconds > 0 ? (haversineMeters(from, to) / seconds) * 3.6 : 0;
};

/** The phone's reading where it gave one, else the step's. */
const kmhAt = (points: readonly TrackSample[], index: number): number => {
  const reading = points[index]!.speedKmh;
  return reading !== null && reading !== undefined && Number.isFinite(reading) ? reading : stepKmh(points, index);
};

/**
 * The phone records nothing while the bike stands still, so the first fix after
 * a wait can already read riding speed. A step that covered its ground slower
 * than walking pace is that wait, and breaks the riding either side of it.
 */
const isUnbroken = (points: readonly TrackSample[], index: number): boolean =>
  stepKmh(points, index) >= WALKING_MAX_KMH;

/**
 * Road covered. A step no motorcycle could make is two sources feeding one
 * track (a dev simulation and a phone, say), not distance, and is skipped.
 */
const pathLength = (points: readonly TrackSample[]): number =>
  points.reduce((total, point, index) => {
    if (index === 0) return 0;
    const previous = points[index - 1]!;
    const metres = haversineMeters(previous, point);
    const seconds = secondsBetween(previous, point);
    const isPlausible = seconds > 0 && metres / seconds <= MAX_PLAUSIBLE_SPEED_MPS;
    return isPlausible ? total + metres : total;
  }, 0);

/** Faster than walking, with no wait before it. */
const isMoving = (points: readonly TrackSample[], index: number): boolean =>
  kmhAt(points, index) >= WALKING_MAX_KMH && isUnbroken(points, index);

/**
 * Riding holds above walking pace for a while and averages riding speed over
 * it. Slow riding dips below riding speed now and then; a walker indoors reads
 * the odd fast fix, but never holds above walking pace for long.
 */
const isRidingRun = (points: readonly TrackSample[], first: number, last: number): boolean => {
  const seconds = secondsBetween(points[first]!, points[last]!);
  if (seconds < RIDING_SUSTAINED_S) return false;
  return (pathLength(points.slice(first, last + 1)) / seconds) * 3.6 >= RIDING_KMH;
};

/** Stretches where the rider was certainly on the bike, from pulling away to slowing to a halt. */
const ridingSpans = (points: readonly TrackSample[]): Span[] => {
  const spans: Span[] = [];
  let first = -1;
  const close = (last: number) => {
    if (first !== -1 && isRidingRun(points, first, last)) spans.push({ first, last });
    first = -1;
  };
  points.forEach((_, index) => {
    if (!isMoving(points, index)) {
      close(index - 1);
    } else if (first === -1) {
      first = index;
    }
  });
  close(points.length - 1);
  return spans;
};

const matchPlannedStop = (
  parkedAt: LatLng,
  visited: readonly TrackSample[],
  plannedStops: readonly PlannedStopPoint[],
): string | null => {
  const candidates = plannedStops
    .map((stop) => ({
      id: stop.id,
      reachedM: Math.min(...visited.map((point) => haversineMeters(point, stop))),
      parkedM: haversineMeters(parkedAt, stop),
    }))
    .filter((stop) => stop.reachedM <= PLANNED_STOP_REACHED_M || stop.parkedM <= PLANNED_STOP_PARKED_M)
    .sort((a, b) => a.reachedM - b.reachedM);
  return candidates[0]?.id ?? null;
};

const ON_FOOT: readonly MotionActivity[] = ["walking", "running"];
const ON_BIKE: readonly MotionActivity[] = ["automotive", "cycling"];

type PauseEvidence = "on_foot" | "on_bike" | "none";

/** On the bike at every reading, with no silence long enough to have got off in. */
const isOnBikeThroughout = (riddenTo: TrackSample, pause: readonly TrackSample[]): boolean => {
  const readings = pause.filter((point) => point.activity);
  if (readings.length === 0) return false;
  if (!readings.every((point) => point.activity && ON_BIKE.includes(point.activity))) return false;
  const heardAt = [riddenTo, ...readings, pause[pause.length - 1]!].map((point) => point.capturedAtMs);
  return heardAt.slice(1).every((atMs, index) => (atMs - heardAt[index]!) / 1000 <= ON_BIKE_MAX_UNHEARD_S);
};

/** What the motion readings during a pause, after riding ended, say the rider did there. */
const pauseEvidence = (riddenTo: TrackSample, pause: readonly TrackSample[]): PauseEvidence => {
  const onFoot = pause.filter((point) => point.activity && ON_FOOT.includes(point.activity)).length;
  if (onFoot >= ON_FOOT_MIN_READINGS) return "on_foot";
  return isOnBikeThroughout(riddenTo, pause) ? "on_bike" : "none";
};

interface FoundStop {
  stop: RideStop;
  /** The last fix at the bike: where riding picks up again. */
  leftIndex: number;
}

/**
 * The stop in a pause in riding, if it was one. It runs from parking to the
 * last fix at the bike before riding on: a rider often pulls away slowly, in
 * bursts, so the first fix at riding speed can already be well down the road.
 */
const stopBetween = (
  points: readonly TrackSample[],
  parkedIndex: number,
  resumedIndex: number,
  plannedStops: readonly PlannedStopPoint[],
): FoundStop | null => {
  const riddenTo = points[parkedIndex]!;
  // Riding can end a little short of the spot: a slow roll in to park.
  const arrival = points
    .slice(parkedIndex, resumedIndex)
    .filter((point) => secondsBetween(riddenTo, point) <= PARKING_WINDOW_S);
  const fromArrival = (point: LatLng): number =>
    Math.min(...arrival.map((fix) => haversineMeters(fix, point)));

  let leftIndex = -1;
  for (let index = resumedIndex; index > parkedIndex; index -= 1) {
    if (fromArrival(points[index]!) <= STOP_RETURN_M) {
      leftIndex = index;
      break;
    }
  }
  // Never back where they stopped: a jam the rider crawled out of, not a stop.
  if (leftIndex === -1) return null;

  const left = points[leftIndex]!;
  const durationS = secondsBetween(riddenTo, left);
  if (durationS < STOP_MIN_S) return null;

  // The bike is where the rider came back to.
  const bike = arrival.reduce((closest, fix) =>
    haversineMeters(fix, left) < haversineMeters(closest, left) ? fix : closest,
  );
  const visited = points.slice(parkedIndex, leftIndex + 1);
  // The fix riding ended on was still riding; the pause is what came after it.
  const evidence = pauseEvidence(riddenTo, visited.slice(1));
  if (evidence === "on_bike") return null;

  const farthestM = Math.max(...visited.map((point) => haversineMeters(bike, point)));
  const walkedAway = farthestM >= WALKED_AWAY_M || evidence === "on_foot";
  // Without walking off, only riding on from the very spot riding stopped is
  // a stop; creeping on through a standstill is a jam.
  if (!walkedAway && haversineMeters(riddenTo, left) > STOP_RETURN_M) return null;

  const parkedAt = { lat: bike.lat, lng: bike.lng };
  return {
    leftIndex,
    stop: {
      parkedAt,
      startedAtMs: riddenTo.capturedAtMs,
      endedAtMs: left.capturedAtMs,
      durationS: Math.round(durationS),
      farthestM: Math.round(farthestM),
      walkedAway,
      plannedStopId: matchPlannedStop(parkedAt, visited, plannedStops),
    },
  };
};

/**
 * Riding in a track too sparse for sustained stretches: each step between two
 * fixes covered at riding pace. Long silences covered slower than that (the
 * phone left somewhere, or switched off) are not riding, however far apart.
 */
const stepsAtRidingPace = (points: readonly TrackSample[]): TrackSample[][] => {
  const stretches: TrackSample[][] = [];
  let first = -1;
  points.forEach((point, index) => {
    if (index === 0) return;
    const previous = points[index - 1]!;
    const seconds = secondsBetween(previous, point);
    const metres = haversineMeters(previous, point);
    const isRidden =
      seconds > 0 && metres / seconds <= MAX_PLAUSIBLE_SPEED_MPS && (metres / seconds) * 3.6 >= RIDING_KMH;
    if (isRidden && first === -1) first = index - 1;
    if (!isRidden && first !== -1) {
      stretches.push(points.slice(first, index));
      first = -1;
    }
  });
  if (first !== -1) stretches.push(points.slice(first));
  return stretches;
};

const summarize = (riding: TrackSample[][], stops: RideStop[]): SegmentedRide => ({
  riding,
  stops,
  ridingTimeS: Math.round(
    riding.reduce((total, stretch) => total + secondsBetween(stretch[0]!, stretch[stretch.length - 1]!), 0),
  ),
  ridingDistanceM: Math.round(riding.reduce((total, stretch) => total + pathLength(stretch), 0)),
});

/**
 * Splits a track into riding and stops. Waiting before the ride and walking
 * about after it are left out: the ride runs from pulling away to parking.
 * A track with no sustained riding at all, as when the phone barely reported,
 * counts only the steps covered at riding pace; a walk counts as nothing.
 */
export const segmentRide = (
  samples: readonly TrackSample[],
  plannedStops: readonly PlannedStopPoint[] = [],
): SegmentedRide => {
  const points = cleanTrack(samples);
  const spans = ridingSpans(points);
  if (spans.length === 0) return summarize(stepsAtRidingPace(points), []);

  const riding: TrackSample[][] = [];
  const stops: RideStop[] = [];
  let stretchStart = spans[0]!.first;

  spans.slice(1).forEach((span, index) => {
    const parkedIndex = spans[index]!.last;
    const found = stopBetween(points, parkedIndex, span.first, plannedStops);
    if (!found) return;
    riding.push(points.slice(stretchStart, parkedIndex + 1));
    stops.push(found.stop);
    stretchStart = found.leftIndex;
  });
  riding.push(points.slice(stretchStart, spans[spans.length - 1]!.last + 1));

  return summarize(riding, stops);
};
