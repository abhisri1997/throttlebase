/**
 * A rider's own reports, as "Your reports" shows them. The server says where
 * each stands (server/src/core/moderation/grievance.ts); this only words it.
 */
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from "./report";

export interface MyReport {
  id: string;
  reference: string;
  target_type: ReportTargetType;
  reason: ReportReason;
  status: "open" | "actioned" | "dismissed";
  outcome: string;
  created_at: string;
  resolve_due_at: string | null;
  resolved_at: string | null;
  overdue: boolean;
}

const NOUNS: Readonly<Record<ReportTargetType, string>> = {
  post: "A post",
  comment: "A comment",
  rider: "A rider",
  ride: "A ride",
  route: "A route",
  group: "A group",
};

/** "A post · Harassment or bullying" */
export const reportHeadline = (report: MyReport): string => {
  const reason = REPORT_REASONS.find((entry) => entry.reason === report.reason)?.label ?? report.reason;
  return `${NOUNS[report.target_type]} · ${reason}`;
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** When it was resolved, or by when it will be, or that it's late. */
export const reportTimeline = (report: MyReport): string => {
  if (report.status !== "open") {
    return report.resolved_at ? `Resolved ${formatDate(report.resolved_at)}` : "Resolved";
  }
  if (report.overdue) return "Taking longer than it should. Contact the Grievance Officer if you need to.";
  return report.resolve_due_at ? `Due by ${formatDate(report.resolve_due_at)}` : "Under review";
};
