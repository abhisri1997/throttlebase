/**
 * How the navigation camera frames the rider: zoom from speed, heading from
 * the right sensor, day or night from the clock.
 */
import type { NavigationFix } from "../types/navigation";

export const FOLLOW_PITCH_DEGREES = 50;

const KMH_PER_MPS = 3.6;

/** Faster riding needs to see further ahead. */
const ZOOM_BANDS: readonly { maxKmh: number; zoom: number }[] = [
  { maxKmh: 20, zoom: 18.5 },
  { maxKmh: 50, zoom: 17.5 },
  { maxKmh: Number.POSITIVE_INFINITY, zoom: 16.5 },
];
/** Speed has to clear a band edge by this much, so hovering near 20 km/h doesn't pump the zoom. */
const ZOOM_HYSTERESIS_KMH = 4;

export const followZoomForSpeed = (speedMps: number | null, previousZoom?: number): number => {
  const kmh = speedMps !== null && speedMps > 0 ? speedMps * KMH_PER_MPS : 0;
  const bandIndex = ZOOM_BANDS.findIndex((band) => kmh <= band.maxKmh);
  const band = ZOOM_BANDS[bandIndex]!;

  const previousIndex = ZOOM_BANDS.findIndex((candidate) => candidate.zoom === previousZoom);
  if (previousIndex === -1 || previousIndex === bandIndex) return band.zoom;

  const previous = ZOOM_BANDS[previousIndex]!;
  const previousFloor = previousIndex === 0 ? 0 : ZOOM_BANDS[previousIndex - 1]!.maxKmh;
  const isStillNearPrevious =
    kmh > previousFloor - ZOOM_HYSTERESIS_KMH && kmh <= previous.maxKmh + ZOOM_HYSTERESIS_KMH;

  return isStillNearPrevious ? previous.zoom : band.zoom;
};

/** GPS course is only meaningful while moving; standing still, it wanders. */
export const COURSE_MIN_SPEED_MPS = 3;

/**
 * Direction the rider faces: the GPS course while moving, the compass when
 * slow or stopped. Null when neither is known yet.
 */
export const chooseHeading = (
  fix: Pick<NavigationFix, "headingDegrees" | "speedMps"> | null,
  compassDegrees: number | null,
): number | null => {
  const course = fix?.headingDegrees ?? null;
  const isMoving = (fix?.speedMps ?? 0) >= COURSE_MIN_SPEED_MPS;

  if (course !== null && isMoving) return course;
  return compassDegrees ?? course;
};

const DAY_STARTS_AT_MINUTES = 6 * 60;
const NIGHT_STARTS_AT_MINUTES = 18 * 60 + 30;

/** Daytime is 06:00–18:30 local time. */
export const isNavigationDaytime = (date: Date): boolean => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= DAY_STARTS_AT_MINUTES && minutes < NIGHT_STARTS_AT_MINUTES;
};
