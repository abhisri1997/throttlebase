/**
 * Who joins a ride at once, and who asks first.
 *
 * Anyone joins a public ride straight away. A ride that needs approval
 * (visibility 'private') is asked for, and its captain or a co-captain
 * accepts each rider. A declined rider may ask once more, in case the
 * leader declined by mistake; after the second decline they can't ask again.
 */

/** Declines after which a rider can't ask for the ride again. */
export const MAX_DECLINES = 2;

export type RideVisibility = "public" | "private";

export type ParticipantStatus = "invited" | "requested" | "confirmed" | "dropped_out" | "rejected";

/** The rider's existing row on the ride, if they have ever joined or asked. */
export interface ExistingSeat {
  status: ParticipantStatus;
  declineCount: number;
}

export type JoinRefusal = "already_on_ride" | "already_requested" | "declined";

export type JoinDecision = { kind: "join" } | { kind: "request" } | { kind: "refuse"; reason: JoinRefusal };

const refuse = (reason: JoinRefusal): JoinDecision => ({ kind: "refuse", reason });

export const decideJoin = (visibility: RideVisibility, existing: ExistingSeat | null): JoinDecision => {
  if (existing?.status === "confirmed") return refuse("already_on_ride");
  if (visibility === "public") return { kind: "join" };
  if (existing?.status === "requested") return refuse("already_requested");
  if (existing && existing.declineCount >= MAX_DECLINES) return refuse("declined");
  return { kind: "request" };
};

/** The rider's own request, as the ride's preview shows it to them. */
export interface MyRequest {
  status: "none" | "requested" | "declined";
  can_request: boolean;
}

export const describeMyRequest = (existing: ExistingSeat | null): MyRequest => {
  const canRequest = decideJoin("private", existing).kind === "request";
  if (existing?.status === "requested") return { status: "requested", can_request: canRequest };
  if (existing?.status === "rejected") return { status: "declined", can_request: canRequest };
  return { status: "none", can_request: canRequest };
};
