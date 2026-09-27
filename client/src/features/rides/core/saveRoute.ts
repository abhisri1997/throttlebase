/**
 * Naming a route saved from a ride, and explaining why a save failed.
 */

/** The server's limit on a route title. */
export const MAX_ROUTE_TITLE_LENGTH = 255;
const FALLBACK_TITLE = "My ride";

/** The ride's own title, tidied, as a starting point the rider can edit. */
export const defaultRouteTitle = (rideTitle: string | undefined | null): string => {
  const trimmed = rideTitle?.trim() ?? "";
  return trimmed ? trimmed.slice(0, MAX_ROUTE_TITLE_LENGTH) : FALLBACK_TITLE;
};

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
