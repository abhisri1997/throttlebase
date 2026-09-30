/**
 * The admin moderation queue, as the app shows it. The server enforces the
 * same rules (server/src/core/moderation/actions.ts); these only decide
 * which buttons to show.
 */
import type { ReportTargetType } from "./report";

export type ModerationAction = "remove" | "dismiss" | "suspend" | "lift_suspension";

export interface QueueItem {
  target_type: ReportTargetType;
  target_id: string;
  preview: string | null;
  removed: boolean;
  owner_id: string | null;
  owner_name: string | null;
  owner_suspended: boolean;
  report_count: number;
  reasons: string[];
  notes: string[];
  first_reported_at: string;
  last_reported_at: string;
}

export const MIN_REASON_LENGTH = 5;

const REMOVABLE: ReadonlySet<ReportTargetType> = new Set(["post", "comment", "route"]);

/** The buttons for one queue item, in the order shown. */
export const actionsFor = (item: QueueItem, moderatorId: string | null | undefined): ModerationAction[] => {
  const actions: ModerationAction[] = [];
  if (REMOVABLE.has(item.target_type) && !item.removed) actions.push("remove");
  if (item.owner_id && item.owner_id !== moderatorId) {
    actions.push(item.owner_suspended ? "lift_suspension" : "suspend");
  }
  actions.push("dismiss");
  return actions;
};

const NOUNS: Readonly<Record<ReportTargetType, string>> = {
  post: "post",
  comment: "comment",
  rider: "rider",
  ride: "ride",
  route: "route",
  group: "group",
};

export const actionLabel = (action: ModerationAction, item: QueueItem): string => {
  switch (action) {
    case "remove":
      return `Remove ${NOUNS[item.target_type]}`;
    case "suspend":
      return `Suspend ${item.owner_name ?? "rider"}`;
    case "lift_suspension":
      return "Lift suspension";
    case "dismiss":
      return "Dismiss";
  }
};

/** What the reason prompt says each action does, so nothing is a surprise. */
export const actionConsequence = (action: ModerationAction): string => {
  switch (action) {
    case "remove":
      return "Hidden from everyone now, deleted after 180 days. The rider is told, with your reason.";
    case "suspend":
      return "They're signed out everywhere, can't sign in, and their content is hidden until you lift it. They're told, with your reason.";
    case "lift_suspension":
      return "They can sign in again and their content shows again. They're told.";
    case "dismiss":
      return "The reports are closed with no action. Nobody is told.";
  }
};

export const canConfirmReason = (reason: string): boolean => reason.trim().length >= MIN_REASON_LENGTH;

const REASON_LABELS: Readonly<Record<string, string>> = {
  spam: "spam",
  harassment: "harassment",
  hate: "hate",
  sexual: "sexual content",
  violence: "violence",
  dangerous_riding: "dangerous riding",
  impersonation: "impersonation",
  other: "other",
};

/** "3 reports · harassment, hate" */
export const reportSummary = (item: QueueItem): string => {
  const count = item.report_count === 1 ? "1 report" : `${item.report_count} reports`;
  const reasons = item.reasons.map((reason) => REASON_LABELS[reason] ?? reason).join(", ");
  return reasons ? `${count} · ${reasons}` : count;
};
