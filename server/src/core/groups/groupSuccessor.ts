/**
 * Who runs a group when its admin leaves, as in a WhatsApp group: another
 * admin if there is one, otherwise the member who joined first. Admins are
 * ordered by when they joined too — an admin other than the creator is
 * only ever one made by an earlier hand-over.
 */

export interface GroupSuccessorCandidate {
  riderId: string;
  role: "admin" | "member";
  joinedAt: Date | null;
}

/** Earlier first; an unknown time goes last. */
const byTime = (a: Date | null, b: Date | null): number => {
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
};

const compare = (a: GroupSuccessorCandidate, b: GroupSuccessorCandidate): number =>
  Number(b.role === "admin") - Number(a.role === "admin") ||
  byTime(a.joinedAt, b.joinedAt) ||
  a.riderId.localeCompare(b.riderId);

/** The rider who should run the group next, or null when nobody is left. */
export const pickGroupSuccessor = (candidates: readonly GroupSuccessorCandidate[]): string | null =>
  [...candidates].sort(compare)[0]?.riderId ?? null;
