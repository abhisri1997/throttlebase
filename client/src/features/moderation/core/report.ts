/**
 * Reporting what other riders make (launch readiness E3). The server keeps
 * the same lists: server/src/schemas/report.schemas.ts.
 */

export type ReportTargetType = "post" | "comment" | "rider" | "ride" | "route" | "group";

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "dangerous_riding"
  | "impersonation"
  | "other";

/** In the order the sheet lists them, most common first. */
export const REPORT_REASONS: ReadonlyArray<{ reason: ReportReason; label: string; hint: string }> = [
  { reason: "harassment", label: "Harassment or bullying", hint: "Targets or threatens someone" },
  { reason: "hate", label: "Hate", hint: "Attacks people for who they are" },
  { reason: "sexual", label: "Sexual content", hint: "Nudity or sexual content" },
  { reason: "violence", label: "Violence", hint: "Threats, or graphic violence" },
  { reason: "dangerous_riding", label: "Dangerous riding", hint: "Promotes racing, stunts or reckless riding on public roads" },
  { reason: "spam", label: "Spam or scam", hint: "Ads, scams or repeated posts" },
  { reason: "impersonation", label: "Impersonation", hint: "Pretends to be someone else" },
  { reason: "other", label: "Something else", hint: "Tell us in the note" },
];

export const MAX_REPORT_NOTE_LENGTH = 1000;

/** What the sheet is reporting, and whose it is. */
export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** Who made it, for "Also block"; null when there is nobody to block. */
  ownerName: string | null;
}

const NOUNS: Readonly<Record<ReportTargetType, string>> = {
  post: "post",
  comment: "comment",
  rider: "rider",
  ride: "ride",
  route: "route",
  group: "group",
};

export const reportTitle = (target: ReportTarget): string =>
  target.type === "rider" && target.ownerName ? `Report ${target.ownerName}` : `Report this ${NOUNS[target.type]}`;

export interface ReportRequest {
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  note?: string;
  also_block?: boolean;
}

/** The request body; an empty note is left out, and "other" needs one. */
export const buildReportRequest = (
  target: ReportTarget,
  reason: ReportReason,
  note: string,
  alsoBlock: boolean,
): ReportRequest => {
  const trimmed = note.trim().slice(0, MAX_REPORT_NOTE_LENGTH);
  return {
    target_type: target.type,
    target_id: target.id,
    reason,
    ...(trimmed ? { note: trimmed } : {}),
    ...(alsoBlock && target.ownerName ? { also_block: true } : {}),
  };
};

/** "Something else" says nothing without a note. */
export const canSubmitReport = (reason: ReportReason | null, note: string): boolean =>
  reason !== null && (reason !== "other" || note.trim().length > 0);

/** What the rider is told afterwards: what happens next, and when. */
export const reportConfirmation = (alreadyReported: boolean, blocked: boolean): string => {
  const next = alreadyReported
    ? "You've already reported this. We're looking into it."
    : "Thanks for telling us. We review reports within 24 hours and act within 7 days.";
  return blocked ? `${next} You've also blocked them, so you won't see each other's posts or rides.` : next;
};
