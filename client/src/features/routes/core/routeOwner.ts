/**
 * What the rider who saved a route can do with it: change who sees it, or
 * delete it. Wherever a route is made public, the rider is told it stays
 * for the community, without their name, if they delete their account —
 * the same as the Privacy Policy and Terms say.
 */
import type { ConfirmPrompt } from "../../rides/core/rideLeadershipPrompts";

export const PUBLIC_ROUTE_NOTICE =
  "Public routes stay for the community, without your name, if you delete your account.";

/** Others see a public route without its personal ends; the owner sees it whole. */
export const PUBLIC_ROUTE_ENDS_NOTICE =
  "Other riders don't see its first and last 500 m, unless it starts or ends at a public place like a hotel or fuel station.";

export type RouteVisibility = "public" | "private" | "specific_riders";

/** A community route has no owner: nobody can edit, share or delete it. */
export const isRouteOwner = (route: { creator_id: string | null }, riderId: string | undefined): boolean =>
  riderId !== undefined && route.creator_id !== null && route.creator_id === riderId;

/** A route kept, anonymised, after the rider who saved it left ThrottleBase. */
export const COMMUNITY_ROUTE_LABEL = "Community route";

export const isCommunityRoute = (route: { creator_id: string | null }): boolean => route.creator_id === null;

/** Who saved a route, as the app names them: you, the rider, or nobody at all. */
export const routeAuthor = (
  route: { creator_id: string | null; creator_name?: string | null },
  viewerId: string | null | undefined,
): string => {
  if (isCommunityRoute(route)) return COMMUNITY_ROUTE_LABEL;
  if (viewerId && route.creator_id === viewerId) return "You";
  return route.creator_name ?? "A rider";
};

/** The one switch the app offers: public, or only me. */
export const visibilityTarget = (current: RouteVisibility): "public" | "private" =>
  current === "public" ? "private" : "public";

export const visibilityLabel = (current: RouteVisibility): string => {
  if (current === "public") return "Public · others see it without its first and last 500 m";
  if (current === "specific_riders") return "Shared with specific riders";
  return "Only you can see it";
};

export const visibilityPrompt = (target: "public" | "private", title: string): ConfirmPrompt =>
  target === "public"
    ? {
        title: `Make ${title} public?`,
        message: `Anyone can find it in Routes and ride it. ${PUBLIC_ROUTE_ENDS_NOTICE} ${PUBLIC_ROUTE_NOTICE}`,
        confirmLabel: "Make public",
      }
    : {
        title: `Make ${title} private?`,
        message: "Only you will see it. It leaves search, and riders who bookmarked it lose it.",
        confirmLabel: "Make private",
      };

export const deleteRoutePrompt = (title: string): ConfirmPrompt => ({
  title: `Delete ${title}?`,
  message:
    "This can't be undone. Riders who bookmarked it lose it. Rides already planned on it keep their road.",
  confirmLabel: "Delete",
});
