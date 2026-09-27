/**
 * "Was the road as described?" — the wording for asking riders after a ride
 * that followed a saved route's road, and for summing up their answers on the
 * route. Same reason values as the server's.
 */

export const ROAD_FEEDBACK_REASONS = [
  { value: "rough_surface", label: "Rougher surface" },
  { value: "heavy_traffic", label: "More traffic" },
  { value: "road_works", label: "Road works or closures" },
  { value: "not_scenic", label: "Not as scenic" },
  { value: "poorly_lit", label: "Poorly lit" },
  { value: "harder_than_described", label: "Harder riding" },
] as const;

export type RoadFeedbackReason = (typeof ROAD_FEEDBACK_REASONS)[number]["value"];

export interface RoadFeedback {
  as_described: boolean;
  reasons: readonly string[];
  note: string | null;
}

export interface RouteRoadFeedback {
  described: number;
  total: number;
  reasons: readonly { reason: string; count: number }[];
}

const MAX_SUMMARY_REASONS = 3;

const LABELS = new Map<string, string>(ROAD_FEEDBACK_REASONS.map((reason) => [reason.value, reason.label]));

/** "4 of 5 riders said the road was as described", or null before anyone has said. */
export const roadFeedbackHeadline = (summary: RouteRoadFeedback): string | null => {
  if (summary.total === 0) return null;
  if (summary.total === 1) {
    return summary.described === 1
      ? "1 rider said the road was as described"
      : "1 rider said the road wasn't quite as described";
  }
  return `${summary.described} of ${summary.total} riders said the road was as described`;
};

/** "More traffic (2) · Rougher surface": what was different, most-said first. */
export const roadFeedbackReasonsLine = (summary: RouteRoadFeedback): string | null => {
  const known = summary.reasons.filter((entry) => LABELS.has(entry.reason)).slice(0, MAX_SUMMARY_REASONS);
  if (known.length === 0) return null;
  return known
    .map((entry) => (entry.count > 1 ? `${LABELS.get(entry.reason)} (${entry.count})` : LABELS.get(entry.reason)))
    .join(" · ");
};

/** The rider's own answer, played back so they know it counted and can change it. */
export const myAnswerLine = (feedback: RoadFeedback): string => {
  if (feedback.as_described) return "You said the road was as described.";
  const labels = feedback.reasons.flatMap((reason) => {
    const label = LABELS.get(reason);
    return label ? [label.toLowerCase()] : [];
  });
  return labels.length > 0
    ? `You said it wasn't quite: ${labels.join(", ")}.`
    : "You said it wasn't quite as described.";
};

export const toggleReason = (
  picked: readonly RoadFeedbackReason[],
  reason: RoadFeedbackReason,
): RoadFeedbackReason[] => (picked.includes(reason) ? picked.filter((value) => value !== reason) : [...picked, reason]);
