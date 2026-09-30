/**
 * The word filter on posts and comments (launch readiness E3).
 *
 * It refuses text containing a blocked term, with a message that says so,
 * rather than hiding it silently: a rider should know their post didn't go
 * up. It is a first line, not moderation. Reports and the moderation queue
 * catch what a word list can't.
 *
 * Matching is on whole words after normalising, so "Scunthorpe"-style
 * substrings don't trip it, while common disguises do: case, accents,
 * digits and symbols standing in for letters, letters repeated for
 * emphasis, and separators between letters ("i.d.i.o.t"). A phrase matches
 * only within a clause: "go, die-hard fans" is not "go die".
 */

/** Digits and symbols riders type in place of letters. */
const LOOKALIKES: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
};

/**
 * Lower case, accents stripped, lookalikes replaced, and every run of the
 * same letter cut to one, so "Fooool", "f00l" and "fööl" all read "fol".
 * Terms go through the same steps, so they match however they're written.
 */
export const normalizeForFilter = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9@$]/g, (character) => LOOKALIKES[character] ?? character)
    .replace(/([a-z])\1+/g, "$1");

/** Where one clause ends and the next begins, for matching phrases. */
const CLAUSE_BREAK = /[,.;:!?\n\u2013\u2014-]+/;

/** Words in normalised text: runs of letters. Everything else separates them. */
const wordsOf = (normalised: string): string[] => normalised.split(/[^a-z]+/).filter(Boolean);

/**
 * Single letters spaced or dotted out ("i d i o t", "i.d.i.o.t") joined back
 * into one word, so spelling a term out doesn't get it past the filter.
 */
const joinedSpellings = (words: readonly string[]): string[] => {
  const joined: string[] = [];
  let run = "";
  for (const word of words) {
    if (word.length === 1) {
      run += word;
      continue;
    }
    if (run.length > 1) joined.push(run);
    run = "";
  }
  if (run.length > 1) joined.push(run);
  return joined;
};

export interface WordFilter {
  /** The first blocked term the text contains, as listed, or null. */
  findBlockedTerm(text: string): string | null;
}

/**
 * Builds a filter over `terms`. A term of several words ("go die") matches
 * those words in a row.
 */
export const createWordFilter = (terms: readonly string[]): WordFilter => {
  const single = new Map<string, string>();
  const phrases: Array<{ words: string[]; term: string }> = [];

  for (const term of terms) {
    const words = wordsOf(normalizeForFilter(term));
    if (words.length === 1) single.set(words[0]!, term);
    else if (words.length > 1) phrases.push({ words, term });
  }

  return {
    findBlockedTerm(text: string): string | null {
      const words = wordsOf(normalizeForFilter(text));

      for (const word of [...words, ...joinedSpellings(words)]) {
        const hit = single.get(word);
        if (hit) return hit;
      }

      if (phrases.length === 0) return null;
      for (const clause of text.split(CLAUSE_BREAK)) {
        const clauseWords = wordsOf(normalizeForFilter(clause));
        for (const { words: phrase, term } of phrases) {
          for (let start = 0; start + phrase.length <= clauseWords.length; start += 1) {
            if (phrase.every((word, offset) => clauseWords[start + offset] === word)) return term;
          }
        }
      }

      return null;
    },
  };
};
