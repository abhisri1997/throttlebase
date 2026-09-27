/**
 * Naming a route saved from a ride, choosing its highlights, and explaining
 * why a save failed.
 */

/** The server's limit on a route title. */
export const MAX_ROUTE_TITLE_LENGTH = 255;
const FALLBACK_TITLE = "My ride";

/** The ride's own title, tidied, as a starting point the rider can edit. */
export const defaultRouteTitle = (rideTitle: string | undefined | null): string => {
  const trimmed = rideTitle?.trim() ?? "";
  return trimmed ? trimmed.slice(0, MAX_ROUTE_TITLE_LENGTH) : FALLBACK_TITLE;
};

/** "Electronic City, Doddathoguru" → "Electronic City": the area, without its city. */
const shortPlace = (areaName: string): string => areaName.split(",")[0]!.trim();

/** Where the route goes, which says more than the ride's own name. */
export const suggestedRouteTitle = (
  startName: string | null,
  endName: string | null,
  rideTitle: string | undefined | null,
): string => {
  if (!startName || !endName) return defaultRouteTitle(rideTitle);
  const start = shortPlace(startName);
  const end = shortPlace(endName);
  const title = start === end ? `Loop from ${start}` : `${start} → ${end}`;
  return title.slice(0, MAX_ROUTE_TITLE_LENGTH);
};

/** Why the rider saving a route says it is good. Same values as the server's. */
export const ROUTE_HIGHLIGHTS = [
  { value: "scenic_road", label: "Scenic road" },
  { value: "good_surface", label: "Good surface" },
  { value: "quiet", label: "Quiet, little traffic" },
  { value: "well_lit", label: "Well-lit" },
  { value: "great_stops", label: "Great stops" },
  { value: "twisties", label: "Twisties" },
  { value: "night_ride_friendly", label: "Night-ride friendly" },
  { value: "beginner_friendly", label: "Beginner friendly" },
] as const;

export type RouteHighlight = (typeof ROUTE_HIGHLIGHTS)[number]["value"];

export const toggleHighlight = (
  picked: readonly RouteHighlight[],
  highlight: RouteHighlight,
): RouteHighlight[] =>
  picked.includes(highlight) ? picked.filter((value) => value !== highlight) : [...picked, highlight];

/** A stop note is a line or two, matching the server's limit. */
export const MAX_STOP_NOTE_LENGTH = 280;

/** The title to send, or null when there is nothing to name it by. */
export const validRouteTitle = (input: string): string | null => {
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, MAX_ROUTE_TITLE_LENGTH) : null;
};

const MESSAGES_BY_STATUS: Record<number, string> = {
  403: "Only riders who were on this ride can save it as a route.",
  409: "You can save the route once the ride is completed.",
  422: "Not enough of this ride was recorded to make a route.",
};

export const saveRouteErrorMessage = (error: unknown): string => {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return (
    (status !== undefined ? MESSAGES_BY_STATUS[status] : undefined) ??
    "Couldn't save the route. Check your connection and try again."
  );
};
