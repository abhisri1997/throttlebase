/**
 * Synthetic tracks for tests, recorded the way the app records them: a fix
 * every ~20 m of movement and none while standing still. Test-only.
 */
import type { TrackSample } from "../../utils/track.js";

export const ORIGIN = { lat: 12.9, lng: 77.6 };
export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);
const STEP_M = 20;
export const RIDING_ACCURACY_M = 8;
export const INDOOR_ACCURACY_M = 22;

export interface Cursor {
  eastM: number;
  northM: number;
  tMs: number;
}

export type Leg = (from: Cursor) => { samples: TrackSample[]; end: Cursor };

export const at = (cursor: Cursor, speedKmh: number | null, accuracyM: number): TrackSample => ({
  lat: ORIGIN.lat + cursor.northM / M_PER_DEG_LAT,
  lng: ORIGIN.lng + cursor.eastM / M_PER_DEG_LNG,
  accuracyM,
  capturedAtMs: cursor.tMs,
  speedKmh,
});

/** Moves in a straight line, one fix every STEP_M. */
const move =
  (metres: number, kmh: number, direction: { east: number; north: number }, accuracyM: number): Leg =>
  (from) => {
    const steps = Math.max(1, Math.round(metres / STEP_M));
    const stepMs = (STEP_M / (kmh / 3.6)) * 1000;
    const samples = Array.from({ length: steps }, (_, i) =>
      at(
        {
          eastM: from.eastM + direction.east * STEP_M * (i + 1),
          northM: from.northM + direction.north * STEP_M * (i + 1),
          tMs: from.tMs + stepMs * (i + 1),
        },
        kmh,
        accuracyM,
      ),
    );
    return {
      samples,
      end: {
        eastM: from.eastM + direction.east * STEP_M * steps,
        northM: from.northM + direction.north * STEP_M * steps,
        tMs: from.tMs + stepMs * steps,
      },
    };
  };

const EAST = { east: 1, north: 0 };
const NORTH = { east: 0, north: 1 };
const SOUTH = { east: 0, north: -1 };

export const ride = (metres: number, kmh = 40): Leg => move(metres, kmh, EAST, RIDING_ACCURACY_M);
/** Moving along the road at a crawl, as in a jam. */
export const crawl = (metres: number, kmh: number): Leg => move(metres, kmh, EAST, RIDING_ACCURACY_M);
/** Standing still: the phone records nothing. */
export const wait =
  (minutes: number): Leg =>
  (from) => ({ samples: [], end: { ...from, tMs: from.tMs + minutes * 60_000 } });
/** Off the bike: walks away from the road and back to it, indoors. */
export const walkOutAndBack = (metres: number, kmh = 5): Leg => {
  const out = move(metres, kmh, NORTH, INDOOR_ACCURACY_M);
  const back = move(metres, kmh, SOUTH, INDOOR_ACCURACY_M);
  return (from) => {
    const there = out(from);
    const home = back(there.end);
    return { samples: [...there.samples, ...home.samples], end: home.end };
  };
};

export const track = (...legs: Leg[]): TrackSample[] => {
  const start: Cursor = { eastM: 0, northM: 0, tMs: Date.UTC(2026, 8, 25, 14, 45) };
  const first = at(start, 0, RIDING_ACCURACY_M);
  const { samples } = legs.reduce<{ samples: TrackSample[]; end: Cursor }>(
    (acc, leg) => {
      const next = leg(acc.end);
      return { samples: [...acc.samples, ...next.samples], end: next.end };
    },
    { samples: [first], end: start },
  );
  return samples;
};

export const minutes = (seconds: number): number => Math.round(seconds / 6) / 10;
