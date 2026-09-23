import { SignJWT } from "jose";
import type { Clock } from "../../ports/Clock.js";
import type {
  AccessTokenSubject,
  IssuedAccessToken,
  TokenIssuer,
} from "../../ports/TokenIssuer.js";
import type { SigningKey } from "./keys.js";

export interface TokenIssuerConfig {
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

/**
 * Issues our own access tokens.
 *
 * `sub` is always the rider's UUID, never a provider's subject. A Google or
 * Apple id is an identifier in someone else's namespace: putting one in `sub`
 * would break the moment a rider links a second provider, and would leak the
 * provider relationship to anything that reads a token.
 */
export const createJoseTokenIssuer = (
  key: SigningKey,
  config: TokenIssuerConfig,
  clock: Clock,
): TokenIssuer => ({
  issueAccessToken: async (
    subject: AccessTokenSubject,
  ): Promise<IssuedAccessToken> => {
    const issuedAt = Math.floor(clock.now().getTime() / 1000);
    const expiresAt = issuedAt + config.ttlSeconds;

    const token = await new SignJWT({ roles: [...subject.roles] })
      .setProtectedHeader({ alg: "ES256", kid: key.kid, typ: "JWT" })
      .setSubject(subject.riderId)
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(key.privateKey);

    return { token, expiresAt: new Date(expiresAt * 1000) };
  },
});
