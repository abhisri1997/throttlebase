import type { AuthPolicy } from "../core/auth/types.js";

/**
 * Configuration, validated once at boot.
 *
 * Every value is read here and nowhere else. A missing or malformed setting
 * stops the process immediately with a message naming the variable, rather
 * than surfacing hours later as a failed sign-in.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type Env = Record<string, string | undefined>;

const required = (env: Env, name: string): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`${name} is required but not set.`);
  }
  return value;
};

const optional = (env: Env, name: string): string | undefined => {
  const value = env[name]?.trim();
  return value ? value : undefined;
};

const integer = (env: Env, name: string, fallback: number): number => {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
};

/**
 * Comma-separated list that may be absent.
 *
 * An unconfigured provider is a supported state — Apple sign-in ships after
 * the developer account exists — so this returns an empty list rather than
 * refusing to boot.
 */
const optionalList = (env: Env, name: string): string[] => {
  const raw = optional(env, name);
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

/** Comma-separated list, e.g. the set of OAuth client ids. */
const list = (env: Env, name: string): string[] => {
  const raw = required(env, name);
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (values.length === 0) {
    throw new ConfigError(`${name} must contain at least one value.`);
  }
  return values;
};

export interface AuthConfig {
  jwt: {
    privateKeyPem: string;
    kid: string;
    issuer: string;
    audience: string;
    /**
     * Public keys kept in the JWKS after they stop signing, so tokens issued
     * before a rotation keep verifying until they expire.
     */
    retiredPublicKeys: Array<{ kid: string; pem: string }>;
  };
  google: { allowedAudiences: string[] };
  /** Empty when Apple sign-in is not configured yet. */
  apple: { allowedAudiences: string[] };
  policy: AuthPolicy;
}

/**
 * Retired verification keys, as `kid:base64pem` pairs.
 *
 * Rotation without this means every signed-in rider is logged out the moment
 * the key changes.
 */
const parseRetiredKeys = (
  env: Env,
): Array<{ kid: string; pem: string }> => {
  const raw = optional(env, "AUTH_JWT_RETIRED_PUBLIC_KEYS");
  if (!raw) return [];

  return raw.split(",").map((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0) {
      throw new ConfigError(
        'AUTH_JWT_RETIRED_PUBLIC_KEYS entries must be "kid:base64pem", comma separated.',
      );
    }
    return {
      kid: entry.slice(0, separator).trim(),
      pem: entry.slice(separator + 1).trim(),
    };
  });
};

export const readAuthConfig = (env: Env): AuthConfig => ({
  jwt: {
    privateKeyPem: required(env, "AUTH_JWT_PRIVATE_KEY"),
    kid: required(env, "AUTH_JWT_KID"),
    issuer: optional(env, "AUTH_JWT_ISSUER") ?? "https://api.throttlebase.in",
    audience: optional(env, "AUTH_JWT_AUDIENCE") ?? "throttlebase-app",
    retiredPublicKeys: parseRetiredKeys(env),
  },
  google: { allowedAudiences: list(env, "GOOGLE_CLIENT_IDS") },
  apple: { allowedAudiences: optionalList(env, "APPLE_CLIENT_IDS") },
  policy: {
    accessTokenTtlSeconds: integer(env, "AUTH_ACCESS_TOKEN_TTL_SECONDS", 900),
    refreshTokenTtlSeconds: integer(
      env,
      "AUTH_REFRESH_TOKEN_TTL_SECONDS",
      30 * 24 * 60 * 60,
    ),
    otpTtlSeconds: integer(env, "AUTH_OTP_TTL_SECONDS", 600),
    otpMaxAttempts: integer(env, "AUTH_OTP_MAX_ATTEMPTS", 5),
    otpCodeLength: integer(env, "AUTH_OTP_CODE_LENGTH", 6),
    refreshTokenBytes: integer(env, "AUTH_REFRESH_TOKEN_BYTES", 32),
    consent: {
      terms: required(env, "TERMS_VERSION"),
      privacy: required(env, "PRIVACY_VERSION"),
    },
    otpRateLimits: {
      startPerEmailShort: {
        limit: integer(env, "AUTH_OTP_START_PER_EMAIL_LIMIT", 3),
        windowSeconds: integer(env, "AUTH_OTP_START_PER_EMAIL_WINDOW", 900),
      },
      startPerEmailDaily: {
        limit: integer(env, "AUTH_OTP_START_PER_EMAIL_DAILY_LIMIT", 10),
        windowSeconds: integer(
          env,
          "AUTH_OTP_START_PER_EMAIL_DAILY_WINDOW",
          86_400,
        ),
      },
      startPerIp: {
        limit: integer(env, "AUTH_OTP_START_PER_IP_LIMIT", 30),
        windowSeconds: integer(env, "AUTH_OTP_START_PER_IP_WINDOW", 900),
      },
      verifyPerIp: {
        limit: integer(env, "AUTH_OTP_VERIFY_PER_IP_LIMIT", 30),
        windowSeconds: integer(env, "AUTH_OTP_VERIFY_PER_IP_WINDOW", 900),
      },
    },
  },
});
