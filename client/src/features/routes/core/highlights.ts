/** Why the rider who saved a route says it is good. Same values as the server's. */
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

const LABELS = new Map<string, string>(ROUTE_HIGHLIGHTS.map((highlight) => [highlight.value, highlight.label]));

/** The label riders see, or null for a value this app version doesn't know. */
export const highlightLabel = (value: string): string | null => LABELS.get(value) ?? null;

export const toggleHighlight = (
  picked: readonly RouteHighlight[],
  highlight: RouteHighlight,
): RouteHighlight[] =>
  picked.includes(highlight) ? picked.filter((value) => value !== highlight) : [...picked, highlight];
