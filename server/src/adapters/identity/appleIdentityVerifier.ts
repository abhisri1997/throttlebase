import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type {
  AppleCredential,
  AppleIdentityVerifier,
  VerifiedIdentity,
} from "../../ports/IdentityVerifier.js";

const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");
const APPLE_ISSUER = "https://appleid.apple.com";

export interface AppleVerifierConfig {
  /** Our bundle identifier(s); Apple sets `aud` to the client id. */
  allowedAudiences: readonly string[];
}

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};

const fullNameToDisplayName = (
  fullName: AppleCredential["fullName"],
): string | null => {
  if (!fullName) {
    return null;
  }
  const parts = [fullName.givenName, fullName.familyName]
    .filter((part): part is string => typeof part === "string" && part.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
};

export const createAppleIdentityVerifier = (
  config: AppleVerifierConfig,
): AppleIdentityVerifier => {
  if (config.allowedAudiences.length === 0) {
    throw new Error("APPLE_CLIENT_IDS must list at least one client id");
  }

  const jwks = createRemoteJWKSet(APPLE_JWKS_URL);

  return {
    verify: async (credential: AppleCredential): Promise<VerifiedIdentity> => {
      const { payload } = await jwtVerify(credential.identityToken, jwks, {
        issuer: APPLE_ISSUER,
        audience: [...config.allowedAudiences],
      });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new Error("Apple token carries no subject");
      }

      // The nonce binds this token to this sign-in attempt: without the
      // check, a token captured from one session could be replayed into
      // another. Apple echoes back the hash of the nonce the app supplied.
      //
      // Both encodings are accepted because the client SDKs disagree — some
      // set the nonce to the hex digest, others to base64url — and the
      // encoding is not a security property, it is a formatting choice made
      // on the far side of the call. Rejecting the wrong one would mean
      // Apple sign-in silently never works.
      if (typeof payload.nonce !== "string") {
        throw new Error("Apple token carries no nonce");
      }

      const digest = createHash("sha256").update(credential.rawNonce).digest();
      const accepted = [digest.toString("hex"), digest.toString("base64url")];

      if (!accepted.some((candidate) => constantTimeEquals(candidate, payload.nonce as string))) {
        throw new Error("Apple token nonce does not match this sign-in attempt");
      }

      const emailVerified =
        payload.email_verified === true || payload.email_verified === "true";
      const email = typeof payload.email === "string" ? payload.email : null;

      return {
        provider: "apple",
        subject: payload.sub,
        email,
        emailVerified,
        // Apple returns a name exactly once, on first sign-in, so the app
        // forwards what it was given rather than the token carrying it.
        displayName: fullNameToDisplayName(credential.fullName),
        avatarUrl: null,
      };
    },
  };
};
