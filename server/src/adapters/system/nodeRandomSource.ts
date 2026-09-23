import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { RandomSource } from "../../ports/RandomSource.js";

/**
 * CSPRNG-backed randomness.
 *
 * `randomInt` rather than `Math.random() * 10`: OTP digits guard an account,
 * and randomInt draws uniformly from a cryptographic source with no modulo
 * bias.
 */
export const nodeRandomSource: RandomSource = {
  token: (byteLength: number): string => randomBytes(byteLength).toString("base64url"),

  digits: (count: number): string => {
    let out = "";
    for (let i = 0; i < count; i += 1) {
      out += String(randomInt(0, 10));
    }
    return out;
  },

  uuid: (): string => randomUUID(),
};
