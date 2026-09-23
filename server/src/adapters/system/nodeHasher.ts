import { createHash, timingSafeEqual } from "node:crypto";
import type { Hasher } from "../../ports/Hasher.js";

export const nodeHasher: Hasher = {
  sha256Hex: (input: string): string =>
    createHash("sha256").update(input, "utf8").digest("hex"),

  /**
   * Constant-time comparison.
   *
   * A plain `===` returns as soon as two strings differ, and that timing
   * difference is enough to recover a secret one character at a time. The
   * length check is deliberately non-constant-time: timingSafeEqual throws on
   * unequal lengths, and a length is not the secret.
   */
  timingSafeEqual: (a: string, b: string): boolean => {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  },
};
