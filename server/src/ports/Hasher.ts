/**
 * Digest and comparison primitives.
 *
 * Core never hashes directly: refresh tokens and OTP codes are only ever
 * persisted as digests, and comparing them must not leak timing information.
 * Both rules are easier to enforce when they live behind one small port.
 */
export interface Hasher {
  sha256Hex(input: string): string;
  /** Constant-time comparison. Returns false for length mismatches. */
  timingSafeEqual(a: string, b: string): boolean;
}
