/**
 * The stops a rider chooses from when saving a ride as a route: planned stops
 * they rode past, stops they found on the way (somewhere they got off that
 * wasn't planned), and planned stops the ride skipped. Same shape as the
 * route preview's stop_choices.
 */
import { formatDistance, formatDuration } from "../../navigation/core/format";

export interface StopChoice {
  /** Stable between preview and save. */
  key: string;
  kind: "planned" | "discovered";
  status: "visited" | "skipped" | "found";
  ride_stop_id: string | null;
  name: string | null;
  distance_from_start_km: number | null;
  /** How long the rider was stopped there, when they stopped. */
  stopped_s: number | null;
  walked_away: boolean;
  /** Ticked to start with. */
  suggested: boolean;
}

export interface StopEdit {
  kept: boolean;
  note: string;
  /** Only for a stop the rider found; planned stops keep their name. */
  name: string;
}

export type StopEdits = Readonly<Record<string, StopEdit>>;

export interface StopToSave {
  key: string;
  note?: string;
  name?: string;
}

/** "3.3 km in · stopped 13 min, walked off", or why a stop can't be kept. */
export const stopChoiceDetail = (choice: StopChoice): string => {
  if (choice.status === "skipped") return "Skipped: the ride didn't go near it";
  const where = choice.distance_from_start_km !== null ? `${formatDistance(choice.distance_from_start_km * 1000)} in` : null;
  const what =
    choice.stopped_s === null
      ? "rode past"
      : `stopped ${formatDuration(choice.stopped_s)}${choice.walked_away ? ", walked off" : " beside the bike"}`;
  return [where, what].filter(Boolean).join(" · ");
};

export const initialStopEdits = (choices: readonly StopChoice[]): Record<string, StopEdit> =>
  Object.fromEntries(choices.map((choice) => [choice.key, { kept: choice.suggested, note: "", name: "" }]));

/** The ticked stops, with a note or a name only where the rider wrote one. */
export const keptStopsForSave = (choices: readonly StopChoice[], edits: StopEdits): StopToSave[] =>
  choices.flatMap((choice) => {
    const edit = edits[choice.key];
    if (!edit?.kept || choice.status === "skipped") return [];
    const note = edit.note.trim();
    const name = choice.kind === "discovered" ? edit.name.trim() : "";
    return [{ key: choice.key, ...(note ? { note } : {}), ...(name ? { name } : {}) }];
  });
