import { createLocalJWKSet, jwtVerify } from "jose";
import type { PublicKeySet } from "./keys.js";
import type {
  AccessTokenClaims,
  TokenVerifier,
} from "../../ports/TokenVerifier.js";

export interface TokenVerifierConfig {
  issuer: string;
  audience: string;
}

/**
 * Verifies the tokens we issued.
 *
 * The key set is local — we are our own issuer, so there is nothing to fetch
 * and no network call on the hot path. Multiple keys are supported so a
 * rotation can publish the new key before it starts signing with it.
 */
export const createJoseTokenVerifier = (
  jwks: PublicKeySet,
  config: TokenVerifierConfig,
): TokenVerifier => {
  const keySet = createLocalJWKSet(jwks);

  return {
    verifyAccessToken: async (token: string): Promise<AccessTokenClaims> => {
      const { payload } = await jwtVerify(token, keySet, {
        issuer: config.issuer,
        audience: config.audience,
        // Pinned: without it, a token could name its own algorithm and an
        // attacker could try to downgrade the check.
        algorithms: ["ES256"],
      });

      if (typeof payload.sub !== "string") {
        throw new Error("Access token has no subject");
      }

      const roles = Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === "string")
        : [];

      return {
        sub: payload.sub,
        iss: String(payload.iss),
        aud: String(payload.aud),
        iat: Number(payload.iat),
        exp: Number(payload.exp),
        roles,
      };
    },
  };
};
