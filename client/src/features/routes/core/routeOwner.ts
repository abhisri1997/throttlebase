/**
 * What the rider who saved a route can do with it: change who sees it, or
 * delete it. Wherever a route is made public, the rider is told it stays
 * for the community, without their name, if they delete their account —
 * the same as the Privacy Policy and Terms say.
 */
import type { ConfirmPrompt } from "../../rides/core/rideLeadershipPrompts";

export const PUBLIC_ROUTE_NOTICE =
  "Public routes stay for the community, without your name, if you delete your account.";

export type RouteVisibility = "public" | "private" | "specific_riders";

export const isRouteOwner = (route: { creator_id: string }, riderId: string | undefined): boolean =>
  riderId !== undefined && route.creator_id === riderId;

/** The one switch the app offers: public, or only me. */
export const visibilityTarget = (current: RouteVisibility): "public" | "private" =>
  current === "public" ? "private" : "public";

export const visibilityLabel = (current: RouteVisibility): string => {
  if (current === "public") return "Public · anyone can find it and ride it";
  if (current === "specific_riders") return "Shared with specific riders";
  return "Only you can see it";
};

export const visibilityPrompt = (target: "public" | "private", title: string): ConfirmPrompt =>
  target === "public"
    ? {
        title: `Make ${title} public?`,
        message: `Anyone can find it in Routes and ride it. ${PUBLIC_ROUTE_NOTICE}`,
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
