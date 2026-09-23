import { createRemoteJWKSet, jwtVerify } from "jose";
import type {
  GoogleIdentityVerifier,
  VerifiedIdentity,
} from "../../ports/IdentityVerifier.js";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");

/** Google signs with either of these, depending on the endpoint's vintage. */
const VALID_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleVerifierConfig {
  /**
   * Every OAuth client that may legitimately mint a token for us.
   *
   * All of them are listed because Google's iOS and Android SDKs disagree
   * about whether `aud` is the web client or the platform client, and the
   * failure mode is a 401 on one platform only.
   */
  allowedAudiences: readonly string[];
}

export const createGoogleIdentityVerifier = (
  config: GoogleVerifierConfig,
): GoogleIdentityVerifier => {
  if (config.allowedAudiences.length === 0) {
    throw new Error("GOOGLE_CLIENT_IDS must list at least one client id");
  }

  // Cached and refreshed by jose; Google rotates these keys regularly.
  const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

  return {
    verify: async (idToken: string): Promise<VerifiedIdentity> => {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: VALID_ISSUERS,
        audience: [...config.allowedAudiences],
      });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new Error("Google token carries no subject");
      }

      // Google sends email_verified as a boolean or the string "true"
      // depending on the flow.
      const emailVerified =
        payload.email_verified === true || payload.email_verified === "true";
      const email =
        typeof payload.email === "string" ? payload.email : null;

      return {
        provider: "google",
        subject: payload.sub,
        email,
        emailVerified,
        displayName: typeof payload.name === "string" ? payload.name : null,
        avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
      };
    },
  };
};
