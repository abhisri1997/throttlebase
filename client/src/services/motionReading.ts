/**
 * The phone's motion reading, reduced to what goes with a location fix.
 *
 * The server uses it to tell a rider who got off the bike (walking) from one
 * sitting on it in a standstill jam (automotive, cycling), which GPS alone
 * can't. It is extra evidence only: a fix without it is still a fix.
 */
import type { MotionActivityObject } from "expo-location";

export type MotionActivityLabel = "automotive" | "cycling" | "walking" | "running" | "stationary";

export interface MotionReading {
  activity: MotionActivityLabel;
  /** When the app got it: on iOS the reading's own time is when the activity began. */
  receivedAtMs: number;
}

/**
 * The sensors report on change and pause while the app is in the background,
 * so a reading further than this from a fix's time may not be what the rider
 * was doing then.
 */
export const MOTION_READING_FRESH_MS = 2 * 60_000;

/** MotionActivityConfidence.Medium; a low-confidence reading is a guess. */
const MIN_CONFIDENCE = 1;

/**
 * Equal confidence goes to the first of these: iOS flags a vehicle waiting at
 * a light as both automotive and stationary, and the vehicle is what matters.
 */
const BY_PRECEDENCE: readonly MotionActivityLabel[] = ["automotive", "cycling", "walking", "running", "stationary"];

type Activities = MotionActivityObject["activities"];

// The labels are MotionActivityType's values; the enum itself is native-only.
const stateOf = (activities: Activities, activity: MotionActivityLabel) =>
  activities[activity as keyof Activities] as Activities[keyof Activities] | undefined;

/** The one activity the sensors are surest of, or null when they aren't sure of any. */
export const dominantActivity = ({ activities }: Pick<MotionActivityObject, "activities">): MotionActivityLabel | null => {
  const confident = BY_PRECEDENCE.filter((activity) => {
    const state = stateOf(activities, activity);
    return state?.detected === true && state.confidence >= MIN_CONFIDENCE;
  });
  const confidenceOf = (activity: MotionActivityLabel): number => stateOf(activities, activity)?.confidence ?? 0;
  // A stable sort keeps precedence among equals.
  return [...confident].sort((a, b) => confidenceOf(b) - confidenceOf(a))[0] ?? null;
};

/** The reading to send with a fix taken at this time, if it was close enough in time to trust. */
export const freshActivity = (reading: MotionReading | null, fixAtMs: number): MotionActivityLabel | undefined =>
  reading && Math.abs(fixAtMs - reading.receivedAtMs) <= MOTION_READING_FRESH_MS ? reading.activity : undefined;
