/**
 * Who leads a ride when its captain leaves ThrottleBase.
 *
 * A co-captain the captain chose comes first, earliest appointed first.
 * Without one, the rider with the most completed rides takes over, and
 * among equals whoever joined the ride first. Self-described experience
 * plays no part: it is unverified.
 */

export interface SuccessorCandidate {
  riderId: string;
  role: "co_captain" | "rider";
  /** When they were made co-captain; null for co-captains appointed before this was recorded. */
  promotedAt: Date | null;
  joinedAt: Date | null;
  completedRides: number;
}

/** Earlier first; an unknown time goes last. */
const byTime = (a: Date | null, b: Date | null): number => {
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
};

const coCaptainsFirst = (a: SuccessorCandidate, b: SuccessorCandidate): number =>
  Number(b.role === "co_captain") - Number(a.role === "co_captain");

/** Only reached for two candidates with the same role. */
const bySeniority = (a: SuccessorCandidate, b: SuccessorCandidate): number =>
  a.role === "co_captain"
    ? byTime(a.promotedAt ?? a.joinedAt, b.promotedAt ?? b.joinedAt)
    : b.completedRides - a.completedRides;

const compare = (a: SuccessorCandidate, b: SuccessorCandidate): number =>
  coCaptainsFirst(a, b) ||
  bySeniority(a, b) ||
  byTime(a.joinedAt, b.joinedAt) ||
  a.riderId.localeCompare(b.riderId);

/** The rider who should lead next, or null when nobody is left to. */
export const pickRideSuccessor = (candidates: readonly SuccessorCandidate[]): string | null =>
  [...candidates].sort(compare)[0]?.riderId ?? null;
