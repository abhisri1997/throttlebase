/**
 * Turns Google Directions `html_instructions` into banner-ready text.
 *
 * Google packs two things into one HTML string: the maneuver ("Turn <b>left</b>
 * onto <b>MG Rd</b>") and, in a trailing <div>, a secondary note ("Pass by
 * Indian Oil (on the left)"). Replacing every tag with a space glues the two
 * into one run-on sentence, so they are separated here instead.
 */

export interface ParsedInstruction {
  /** The maneuver without Google's note, e.g. "Turn left onto MG Rd". */
  primary: string;
  /** The road the maneuver leads onto, for the banner headline, when Google names one. */
  roadName: string | null;
  /** Google's secondary line, e.g. "Pass by Indian Oil (on the left)". */
  note: string | null;
}

const FALLBACK_INSTRUCTION = "Continue";
const MAX_CODE_POINT = 0x10ffff;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** The road follows "onto", "on" or "toward" in Google's bold markup. */
const ROAD_NAME_PATTERN = /\b(?:onto|on|toward|towards)\s*<b>(.*?)<\/b>/i;

const fromCodePoint = (code: number, original: string): string =>
  Number.isInteger(code) && code >= 0 && code <= MAX_CODE_POINT
    ? String.fromCodePoint(code)
    : original;

export const decodeHtmlEntities = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();

    if (lower.startsWith("#x")) return fromCodePoint(parseInt(lower.slice(2), 16), match);
    if (lower.startsWith("#")) return fromCodePoint(parseInt(lower.slice(1), 10), match);

    return NAMED_ENTITIES[lower] ?? match;
  });

const toPlainText = (html: string): string =>
  decodeHtmlEntities(
    html
      // <wbr> marks a line-break opportunity inside a single word or road name.
      .replace(/<wbr\s*\/?>/gi, "")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

export const parseInstructionHtml = (
  html: string | null | undefined,
): ParsedInstruction => {
  if (!html) return { primary: FALLBACK_INSTRUCTION, roadName: null, note: null };

  const noteStart = html.search(/<div\b/i);
  const mainHtml = noteStart === -1 ? html : html.slice(0, noteStart);
  const noteHtml = noteStart === -1 ? "" : html.slice(noteStart);

  const notes = noteHtml
    .split(/<div\b[^>]*>/i)
    .map(toPlainText)
    .filter((text) => text.length > 0);

  const mainText = toPlainText(mainHtml);
  // A step that is nothing but a note still needs a primary line.
  const primary = mainText || notes.shift() || FALLBACK_INSTRUCTION;
  const roadMatch = mainHtml.match(ROAD_NAME_PATTERN);

  return {
    primary,
    roadName: roadMatch?.[1] ? toPlainText(roadMatch[1]) || null : null,
    note: notes.length > 0 ? notes.join(" · ") : null,
  };
};
