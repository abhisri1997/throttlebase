import { createAppleIdentityVerifier } from "../adapters/identity/appleIdentityVerifier.js";
import { createGoogleIdentityVerifier } from "../adapters/identity/googleIdentityVerifier.js";
import { createOtpStore } from "../adapters/postgres/otpStore.js";
import { createRateLimiter } from "../adapters/postgres/rateLimiter.js";
import { createRiderRepository } from "../adapters/postgres/riderRepository.js";
import { createSessionRepository } from "../adapters/postgres/sessionRepository.js";
import { nodeHasher } from "../adapters/system/nodeHasher.js";
import { nodeRandomSource } from "../adapters/system/nodeRandomSource.js";
import { systemClock } from "../adapters/system/systemClock.js";
import { createJoseTokenIssuer } from "../adapters/tokens/joseTokenIssuer.js";
import { createJoseTokenVerifier } from "../adapters/tokens/joseTokenVerifier.js";
import {
  loadSigningKey,
  loadVerificationKey,
  type PublicKeySet,
} from "../adapters/tokens/keys.js";
import { createPool } from "../adapters/postgres/pool.js";
import { createEmailSender } from "./createEmailSender.js";
import { readAuthConfig, type Env } from "./env.js";

/**
 * The composition root: the one place that knows which adapter implements
 * which port.
 *
 * Everything above this file depends on interfaces we own. Swapping the
 * database, the mailer or the identity provider is an edit here plus one new
 * adapter — never a change to a use case.
 */

export type AuthContainer = Awaited<ReturnType<typeof buildAuthContainer>>;

export const buildAuthContainer = async (env: Env) => {
  const config = readAuthConfig(env);

  // The auth stack has its own pool rather than sharing config/db.ts, which
  // forces TLS on for any DATABASE_URL — a workaround for one managed host
  // that breaks against a local container or any server without TLS. The
  // legacy pool is retired in the next phase and this becomes the only one.
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = createPool({
    connectionString,
    rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
  });

  const signingKey = await loadSigningKey({
    pem: config.jwt.privateKeyPem,
    kid: config.jwt.kid,
  });

  const retired = await Promise.all(
    config.jwt.retiredPublicKeys.map((key) => loadVerificationKey(key)),
  );

  // The active key first: verifiers try keys in order, and almost every
  // token presented was signed by the current one.
  const jwks: PublicKeySet = {
    keys: [signingKey.publicJwk, ...retired.map((key) => key.publicJwk)],
  };

  return {
    config,
    jwks,
    riders: createRiderRepository(pool),
    sessions: createSessionRepository(pool),
    otps: createOtpStore(pool),
    rateLimiter: createRateLimiter(pool),
    email: createEmailSender(env),
    hasher: nodeHasher,
    random: nodeRandomSource,
    clock: systemClock,
    policy: config.policy,
    tokenIssuer: createJoseTokenIssuer(
      signingKey,
      {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        ttlSeconds: config.policy.accessTokenTtlSeconds,
      },
      systemClock,
    ),
    tokenVerifier: createJoseTokenVerifier(jwks, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }),
    google: createGoogleIdentityVerifier(config.google),
    apple: createAppleIdentityVerifier(config.apple),
  };
};
