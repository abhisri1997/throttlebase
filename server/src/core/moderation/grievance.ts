/**
 * Reports as grievances (IT Rules 2021, Rule 3(2); launch readiness E3).
 *
 * A report is acknowledged the moment it is received, with a reference the
 * rider can quote, and must be resolved by a deadline that depends on what
 * it is about. ⚖️ The deadlines are the plan's reading of the rules; a
 * lawyer confirms them before launch.
 */

/** The acknowledgement deadline. Reports are acknowledged on receipt, well inside it. */
export const ACKNOWLEDGE_WITHIN_HOURS = 24;

/** The resolution deadline for most reports. */
export const RESOLVE_WITHIN_DAYS = 7;

/** Reasons resolved faster. Sexual content: 72 hours. ⚖️ */
export const RESOLVE_WITHIN_HOURS_BY_REASON: Readonly<Record<string, number>> = {
  sexual: 72,
};

const HOUR_MS = 60 * 60 * 1000;

export const resolveDueAt = (receivedAt: Date, reason: string): Date => {
  const hours = RESOLVE_WITHIN_HOURS_BY_REASON[reason] ?? RESOLVE_WITHIN_DAYS * 24;
  return new Date(receivedAt.getTime() + hours * HOUR_MS);
};

/** "R-1A2B3C4D": short enough to read out, from the report's id. */
export const reportReference = (reportId: string): string =>
  `R-${reportId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export type ReportStatus = "open" | "actioned" | "dismissed";

/** What the reporter is told about their report, as it stands. */
export const outcomeFor = (status: ReportStatus): string => {
  switch (status) {
    case "open":
      return "We're reviewing it.";
    case "actioned":
      return "We reviewed it and took action.";
    case "dismissed":
      return "We reviewed it and found it didn't break the Community Guidelines.";
  }
};

export const isOverdue = (status: ReportStatus, dueAt: Date, now: Date): boolean =>
  status === "open" && now.getTime() > dueAt.getTime();
