/**
 * Cryptographically secure randomness as a port.
 *
 * Kept out of core so use cases stay deterministic under test: a fake source
 * returns scripted values while the real adapter reaches for node:crypto.
 */
export interface RandomSource {
  /** URL-safe opaque token with at least `byteLength` bytes of entropy. */
  token(byteLength: number): string;
  /** Uniformly distributed decimal digits, for OTP codes. */
  digits(count: number): string;
  uuid(): string;
}
