/**
 * What riders may write in posts and comments: the word filter
 * (core/moderation/wordFilter.ts) over the starting list of blocked terms.
 */
import { BLOCKED_TERMS } from "../core/moderation/blockedTerms.js";
import { createWordFilter } from "../core/moderation/wordFilter.js";

const filter = createWordFilter(BLOCKED_TERMS);

export class ContentNotAllowedError extends Error {
  readonly code = "CONTENT_NOT_ALLOWED";

  constructor() {
    // Says what to do, without repeating the word back or revealing the list.
    super("This contains language that isn't allowed on ThrottleBase. Please edit it and try again.");
    this.name = "ContentNotAllowedError";
  }
}

export const assertContentAllowed = (text: string): void => {
  if (filter.findBlockedTerm(text) !== null) throw new ContentNotAllowedError();
};
