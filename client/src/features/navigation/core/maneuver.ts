/**
 * Which arrow to show for a Directions `maneuver`. Google doesn't document the
 * full list of legacy values and adds new ones without notice, so anything
 * unrecognised — or missing, as on the first step — is shown as straight on.
 */

export type ManeuverIconKind =
  | "turn-left"
  | "turn-right"
  | "slight-left"
  | "slight-right"
  | "straight"
  | "uturn"
  | "merge"
  | "fork"
  | "roundabout-left"
  | "roundabout-right"
  | "arrive"
  | "depart";

const ICON_BY_MANEUVER: ReadonlyMap<string, ManeuverIconKind> = new Map([
  ["turn-left", "turn-left"],
  ["turn-sharp-left", "turn-left"],
  ["turn-right", "turn-right"],
  ["turn-sharp-right", "turn-right"],
  ["turn-slight-left", "slight-left"],
  ["keep-left", "slight-left"],
  ["ramp-left", "slight-left"],
  ["turn-slight-right", "slight-right"],
  ["keep-right", "slight-right"],
  ["ramp-right", "slight-right"],
  ["fork-left", "fork"],
  ["fork-right", "fork"],
  ["uturn-left", "uturn"],
  ["uturn-right", "uturn"],
  ["merge", "merge"],
  ["roundabout-left", "roundabout-left"],
  ["roundabout-right", "roundabout-right"],
  ["straight", "straight"],
]);

export const maneuverIconKind = (maneuver?: string | null): ManeuverIconKind =>
  (maneuver ? ICON_BY_MANEUVER.get(maneuver) : undefined) ?? "straight";
