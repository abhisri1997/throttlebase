/**
 * A stable look for each rider on the map.
 *
 * Riders need telling apart at a glance while moving, so every rider gets their
 * own colour, derived from their id rather than their position in a list: the
 * crew list reorders as people join, leave and go offline, and a rider whose
 * colour changed mid-ride would be worse than no colour at all.
 *
 * The same rider therefore looks the same on every device in the session, and
 * across app restarts, without anything being stored or agreed between them.
 *
 * When riders' own bikes are drawn here instead, this stays the fallback for
 * anyone who has not added one.
 */

/**
 * Chosen to stay apart on a dark map, and to differ in lightness as well as
 * hue so they remain distinguishable with the common forms of colour blindness.
 */
export const PEER_COLORS = [
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#84CC16", // lime
  "#F97316", // orange
  "#3B82F6", // blue
  "#14B8A6", // teal
] as const;

export interface PeerAppearance {
  /** Badge fill. */
  color: string;
  /** Falls back to this where the full name will not fit. */
  initial: string;
}

/**
 * FNV-1a, for a well-spread index from an arbitrary id.
 *
 * Summing character codes would collide constantly on UUIDs, which share most
 * of their characters.
 */
const hashCode = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** The first letter a reader would recognise, uppercased. */
const initialOf = (displayName: string): string => {
  const trimmed = displayName.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
};

export const peerAppearance = (
  riderId: string,
  displayName = "",
): PeerAppearance => ({
  color: PEER_COLORS[hashCode(riderId) % PEER_COLORS.length]!,
  initial: initialOf(displayName),
});
