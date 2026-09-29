/**
 * Live-ride incidents: their kinds, and what riders are told about them.
 *
 * The safety flow is a group alert. It alerts the riders on the ride and is
 * never described as SOS or as an emergency service (launch readiness D8):
 * promising help we cannot guarantee is the risk, not the lack of a feature.
 */

export const INCIDENT_KINDS = [
  "group_alert",
  "crash",
  "medical",
  "mechanical",
  "other",
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

/** What app builds before the rename send for a group alert. */
export const LEGACY_GROUP_ALERT_KIND = "sos";

/** Stores a legacy "sos" as the group alert it is. */
export const normalizeIncidentKind = (
  kind: IncidentKind | typeof LEGACY_GROUP_ALERT_KIND,
): IncidentKind => (kind === LEGACY_GROUP_ALERT_KIND ? "group_alert" : kind);

export interface IncidentCopyInput {
  kind: string;
  severity: string;
  /** Null when the reporter's name is unknown. */
  reporterName?: string | null;
  rideTitle?: string | null;
}

export interface NotificationCopy {
  title: string;
  body: string;
}

const rideLabel = (title: string | null | undefined): string => title || "the ride";

const isGroupAlert = (kind: string): boolean =>
  kind === "group_alert" || kind === LEGACY_GROUP_ALERT_KIND;

/** Sent to everyone else on the ride the moment an incident is reported. */
export const incidentReportedCopy = (input: IncidentCopyInput): NotificationCopy => {
  const reporter = input.reporterName || "A rider";
  const ride = rideLabel(input.rideTitle);

  if (isGroupAlert(input.kind)) {
    return {
      title: "Group alert",
      body: `${reporter} sent a group alert on ${ride}. Open the ride to see where they are.`,
    };
  }

  const title =
    input.severity === "critical"
      ? "Critical incident reported"
      : input.severity === "high"
        ? "High-priority incident reported"
        : "Incident reported during live ride";
  const base = `${reporter} reported a ${input.kind} incident on ${ride}.`;
  return {
    title,
    body: input.severity === "critical" ? `${base} Immediate attention recommended.` : base,
  };
};

/** Sent to the ride's leaders when an incident is still open after a while. */
export const incidentUnacknowledgedCopy = (input: IncidentCopyInput): NotificationCopy => {
  const ride = rideLabel(input.rideTitle);

  if (isGroupAlert(input.kind)) {
    return {
      title: "Group alert still unanswered",
      body: `Nobody has responded to a group alert on ${ride} yet. Open the ride to see where the rider is.`,
    };
  }

  return input.severity === "critical"
    ? {
        title: "Critical incident needs acknowledgement",
        body: `A critical ${input.kind} incident is still unacknowledged on ${ride}. Please respond immediately.`,
      }
    : {
        title: "High-priority incident needs acknowledgement",
        body: `A high-priority ${input.kind} incident is still unacknowledged on ${ride}. Please review.`,
      };
};
