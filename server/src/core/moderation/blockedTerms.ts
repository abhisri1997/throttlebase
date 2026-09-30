/**
 * Terms the word filter refuses in posts and comments. ⚖️
 *
 * A deliberately short starting list of clear abuse and threats in English.
 * The owner adds the Hindi, Kannada, Tamil and other Indian-language terms
 * riders actually use, with a lawyer's view on the list as a whole
 * (docs/launch-readiness/plans/ugc-safety.md). Keep it to words that are
 * abusive in any context: an ordinary word that is sometimes rude refuses
 * ordinary posts, and reports catch the rest.
 */
export const BLOCKED_TERMS: readonly string[] = [
  "fuck",
  "fucker",
  "fucking",
  "motherfucker",
  "cunt",
  "bitch",
  "bastard",
  "asshole",
  "whore",
  "slut",
  "retard",
  "faggot",
  "nigger",
  "kill yourself",
  "kys",
  "go die",
  "i will kill you",
  "rape",
];
