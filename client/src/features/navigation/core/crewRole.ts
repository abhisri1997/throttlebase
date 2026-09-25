/**
 * A crew member's role as the crew list shows it. The ride calls ordinary
 * participants "rider" and the live session calls them "member"; anything
 * unrecognised reads as a rider rather than "undefined".
 */
const LEADER_LABELS: Readonly<Record<string, string>> = {
  captain: "Captain",
  co_captain: "Co-Captain",
};

export const crewRoleLabel = (role: string | undefined): string =>
  (role && LEADER_LABELS[role]) || "Rider";
