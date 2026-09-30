/**
 * Naming a route saved from a ride, choosing its highlights, and explaining
 * why a save failed.
 */
import { placesHeadline } from "../../routes/core/routeSummary";

/** The server's limit on a route title. */
export const MAX_ROUTE_TITLE_LENGTH = 255;
const FALLBACK_TITLE = "My ride";

/** The ride's own title, tidied, as a starting point the rider can edit. */
export const defaultRouteTitle = (rideTitle: string | undefined | null): string => {
  const trimmed = rideTitle?.trim() ?? "";
  return trimmed ? trimmed.slice(0, MAX_ROUTE_TITLE_LENGTH) : FALLBACK_TITLE;
};

/** Where the route goes, which says more than the ride's own name. */
export const suggestedRouteTitle = (
  startName: string | null,
  endName: string | null,
  rideTitle: string | undefined | null,
): string => placesHeadline(startName, endName)?.slice(0, MAX_ROUTE_TITLE_LENGTH) ?? defaultRouteTitle(rideTitle);

export { ROUTE_HIGHLIGHTS, toggleHighlight, type RouteHighlight } from "../../routes/core/highlights";

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

/** Saved public, others would see it without its personal ends, and too little would be left. */
export const ROUTE_TOO_SHORT_MESSAGE =
  "This route is too short to share publicly without showing where it starts or ends. Save it as Only me.";

export const saveRouteErrorMessage = (error: unknown): string => {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  if (response?.data?.code === "ROUTE_TOO_SHORT") return ROUTE_TOO_SHORT_MESSAGE;
  const status = response?.status;
  return (
    (status !== undefined ? MESSAGES_BY_STATUS[status] : undefined) ??
    "Couldn't save the route. Check your connection and try again."
  );
};
