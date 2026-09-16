/**
 * Picking somewhere for a group to wait for a rider who has fallen behind.
 *
 * The point has to work for both parties: far enough ahead that the group
 * keeps making progress, close enough that nobody stands around for long. A
 * stop the ride was already going to make always wins over a new one —
 * everybody expected to pull in there, so it costs the group nothing.
 */
import type { LatLng } from "../types/navigation";

/** A rider's cruising speed in m/s (~43 km/h), used when nothing better is known. */
const DEFAULT_SPEED_MPS = 12;
/** Longer than this stood at the roadside and the regroup is not worth it. */
export const MAX_REGROUP_WAIT_SECONDS = 15 * 60;
/**
 * How far ahead of the rider furthest along a meeting point has to sit. They
 * are still moving while the proposal is written, sent and answered, so a
 * point just in front of them would be behind them by the time anyone agreed
 * to it — and asking the front of the group to turn back is the one thing a
 * regroup must never do.
 */
export const REGROUP_LEAD_MARGIN_METERS = 1500;

export interface RegroupCandidate {
  id: string;
  name: string;
  coordinate: LatLng;
  /** Distance along the planned route at which it sits. */
  alongMeters: number;
  /** A stop the ride was already going to make. */
  isExistingStop: boolean;
}

export interface RegroupInput {
  candidates: readonly RegroupCandidate[];
  /** How far along the route the rider furthest ahead has got. */
  groupAlongMeters: number;
  /** How far along the route the rider behind has got. */
  riderAlongMeters: number;
  groupSpeedMps?: number;
  riderSpeedMps?: number;
  maxWaitSeconds?: number;
  leadMarginMeters?: number;
}

export interface RegroupSuggestion {
  candidate: RegroupCandidate;
  groupEtaSeconds: number;
  riderEtaSeconds: number;
  /** How long the group stands waiting; 0 when the rider arrives first. */
  waitSeconds: number;
}

const etaSeconds = (distanceMeters: number, speedMps: number): number =>
  speedMps > 0 ? Math.max(0, distanceMeters) / speedMps : Number.POSITIVE_INFINITY;

/**
 * The best place ahead of the group to wait, or null when regrouping would
 * cost more standing about than it is worth — the rider should simply chase
 * the group instead.
 */
export const suggestRegroupPoint = ({
  candidates,
  groupAlongMeters,
  riderAlongMeters,
  groupSpeedMps = DEFAULT_SPEED_MPS,
  riderSpeedMps = DEFAULT_SPEED_MPS,
  maxWaitSeconds = MAX_REGROUP_WAIT_SECONDS,
  leadMarginMeters = REGROUP_LEAD_MARGIN_METERS,
}: RegroupInput): RegroupSuggestion | null => {
  const ahead = candidates.filter(
    (candidate) => candidate.alongMeters > groupAlongMeters + leadMarginMeters,
  );

  const scored = ahead.map((candidate): RegroupSuggestion => {
    const groupEtaSeconds = etaSeconds(
      candidate.alongMeters - groupAlongMeters,
      groupSpeedMps,
    );
    const riderEtaSeconds = etaSeconds(
      candidate.alongMeters - riderAlongMeters,
      riderSpeedMps,
    );

    return {
      candidate,
      groupEtaSeconds,
      riderEtaSeconds,
      waitSeconds: Math.max(0, riderEtaSeconds - groupEtaSeconds),
    };
  });

  const bearable = scored.filter(
    (suggestion) =>
      Number.isFinite(suggestion.waitSeconds) && suggestion.waitSeconds <= maxWaitSeconds,
  );

  if (bearable.length === 0) return null;

  // A stop already on the plan first, then whichever leaves the group waiting
  // least, then the nearest — a regroup should not drag the ride out.
  return bearable.reduce((best, suggestion) => {
    if (suggestion.candidate.isExistingStop !== best.candidate.isExistingStop) {
      return suggestion.candidate.isExistingStop ? suggestion : best;
    }
    if (suggestion.waitSeconds !== best.waitSeconds) {
      return suggestion.waitSeconds < best.waitSeconds ? suggestion : best;
    }
    return suggestion.candidate.alongMeters < best.candidate.alongMeters ? suggestion : best;
  });
};
