/**
 * Asking to join a ride that needs approval.
 *
 * Until the captain or a co-captain accepts them, a rider gets only a
 * preview of such a ride from the server: no meeting point, route, stops or
 * riders. A declined rider may ask once more; after a second decline they
 * can't ask again.
 */
import type { ConfirmPrompt } from "./rideLeadershipPrompts";

/** The rider's own request, as the server reports it on a preview. */
export interface MyRequest {
  status: "none" | "requested" | "declined";
  can_request: boolean;
}

export interface RidePreview {
  id: string;
  is_preview: true;
  title: string;
  captain_id: string;
  captain_name: string | null;
  status: string;
  visibility: string;
  scheduled_at: string;
  estimated_duration_min: number | null;
  max_capacity: number | null;
  current_rider_count: number;
  requirements?: { min_experience?: string } | null;
  stop_count?: number | null;
  my_request: MyRequest;
}

/** A waiting request, as the ride's leaders see it. */
export interface JoinRequest {
  rider_id: string;
  display_name: string | null;
  requested_at: string | null;
  /** More than 0 when a leader declined them before: this is their last ask. */
  decline_count: number;
}

export const isRidePreview = (ride: unknown): ride is RidePreview =>
  typeof ride === "object" && ride !== null && (ride as { is_preview?: unknown }).is_preview === true;

export interface RequestAction {
  kind: "request" | "cancel" | "none";
  label: string;
  note: string;
}

export const requestAction = (request: MyRequest): RequestAction => {
  if (request.status === "requested") {
    return {
      kind: "cancel",
      label: "Withdraw request",
      note: "Request sent. You'll be notified when the captain or a co-captain answers.",
    };
  }
  if (request.status === "declined" && request.can_request) {
    return {
      kind: "request",
      label: "Ask again",
      note: "Your request was declined. You can ask once more.",
    };
  }
  if (!request.can_request) {
    return { kind: "none", label: "Request declined", note: "Your request to join this ride was declined." };
  }
  return {
    kind: "request",
    label: "Request to join",
    note: "The captain or a co-captain accepts each rider. You'll see the meeting point and route once you're in.",
  };
};

export type JoinOutcome = "joined" | "requested";

export const joinedMessage = (outcome: JoinOutcome): string =>
  outcome === "requested"
    ? "Request sent. You'll be notified when the captain or a co-captain answers."
    : "You have joined the ride!";

/** Declining uses up one of the rider's two asks, so the leader confirms. */
export const declinePrompt = (request: Pick<JoinRequest, "display_name" | "decline_count">): ConfirmPrompt => {
  const who = request.display_name ?? "This rider";
  return {
    title: `Decline ${request.display_name ?? "this rider"}?`,
    message:
      request.decline_count > 0
        ? `${who} was declined before, so they won't be able to ask again.`
        : `${who} can ask once more.`,
    confirmLabel: "Decline",
  };
};
