/**
 * The name a Ride now gets on its own (docs/ride-now-ux.md §4.2): after the
 * destination when there is one, otherwise after the time of day. The rider
 * renames it at the end.
 */

/** The server's limit on a ride's title. */
const MAX_TITLE_LENGTH = 255;
const DESTINATION_PREFIX = "Ride to ";

/** Local hours at which each part of the day begins. */
const MORNING_FROM_HOUR = 5;
const AFTERNOON_FROM_HOUR = 12;
const EVENING_FROM_HOUR = 17;
const NIGHT_FROM_HOUR = 21;

const timeOfDayName = (hour: number): string => {
  if (hour >= MORNING_FROM_HOUR && hour < AFTERNOON_FROM_HOUR) return "Morning ride";
  if (hour >= AFTERNOON_FROM_HOUR && hour < EVENING_FROM_HOUR) return "Afternoon ride";
  if (hour >= EVENING_FROM_HOUR && hour < NIGHT_FROM_HOUR) return "Evening ride";
  return "Night ride";
};

export const automaticRideName = (now: Date, destinationName?: string | null): string => {
  const place = destinationName?.trim();
  if (!place) return timeOfDayName(now.getHours());

  return `${DESTINATION_PREFIX}${place}`.slice(0, MAX_TITLE_LENGTH);
};
