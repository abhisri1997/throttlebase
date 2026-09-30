/**
 * What a moderator can do about a report, and what the rider is told
 * (launch readiness E3, docs/launch-readiness/plans/ugc-safety.md).
 *
 * - remove: takes a post, comment or route down. Hidden from everyone at
 *   once, kept 180 days for appeals and legal requests, then purged.
 * - dismiss: closes the reports without action.
 * - suspend: the rider who made it can't sign in and their content is
 *   hidden, until the suspension is lifted.
 * - lift_suspension: undoes a suspension.
 *
 * Every action needs a reason. It is shown to the rider for removals and
 * suspensions, and kept in the audit log for all four.
 */

export type ModerationTargetType = "post" | "comment" | "rider" | "ride" | "route" | "group";
export type ModerationAction = "remove" | "dismiss" | "suspend" | "lift_suspension";

/** Things that can be taken down on their own; the rest go through their maker. */
export const REMOVABLE_TARGETS: ReadonlySet<ModerationTargetType> = new Set(["post", "comment", "route"]);

/** Days removed content is kept before the purge deletes it. */
export const REMOVED_CONTENT_RETENTION_DAYS = 180;

export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;

export interface ActionContext {
  targetType: ModerationTargetType;
  /** Who made it; null for a community route kept without its creator. */
  ownerId: string | null;
  ownerSuspended: boolean;
  moderatorId: string;
}

export type ActionRefusal =
  | "not_removable"
  | "no_owner"
  | "own_account"
  | "already_suspended"
  | "not_suspended"
  | "reason_required";

/** Null when the action may go ahead, or why it can't. */
export const refuseAction = (
  action: ModerationAction,
  context: ActionContext,
  reason: string,
): ActionRefusal | null => {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON_LENGTH) return "reason_required";

  switch (action) {
    case "remove":
      return REMOVABLE_TARGETS.has(context.targetType) ? null : "not_removable";
    case "dismiss":
      return null;
    case "suspend":
      if (!context.ownerId) return "no_owner";
      if (context.ownerId === context.moderatorId) return "own_account";
      return context.ownerSuspended ? "already_suspended" : null;
    case "lift_suspension":
      if (!context.ownerId) return "no_owner";
      return context.ownerSuspended ? null : "not_suspended";
  }
};

const NOUNS: Readonly<Record<ModerationTargetType, string>> = {
  post: "post",
  comment: "comment",
  rider: "profile",
  ride: "ride",
  route: "route",
  group: "group",
};

export interface Notice {
  title: string;
  body: string;
}

/**
 * What the rider who made it is told, in the app. Null when they aren't told:
 * a dismissal is between the moderator and the reporters. A suspended rider
 * sees theirs when they next open the app, before sign-in is refused.
 */
export const noticeFor = (
  action: ModerationAction,
  targetType: ModerationTargetType,
  reason: string,
): Notice | null => {
  const why = reason.trim();
  const appeal = "If you think this is a mistake, contact the Grievance Officer through throttlebase.in.";
  switch (action) {
    case "remove":
      return {
        title: `Your ${NOUNS[targetType]} was removed`,
        body: `It broke the Community Guidelines: ${why}. ${appeal}`,
      };
    case "suspend":
      return {
        title: "Your account is suspended",
        body: `Your account was suspended: ${why}. ${appeal}`,
      };
    case "lift_suspension":
      return {
        title: "Your account is active again",
        body: "The suspension on your account has been lifted.",
      };
    case "dismiss":
      return null;
  }
};

/** What happens to the open reports on the thing. */
export const reportStatusAfter = (action: ModerationAction): "actioned" | "dismissed" | null =>
  action === "dismiss" ? "dismissed" : action === "lift_suspension" ? null : "actioned";
