import type { VerifiedIdentity } from "../../ports/IdentityVerifier.js";

/** Request-scoped facts the HTTP adapter passes down into core. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  /** The client must echo the terms version it displayed. */
  acceptedTermsVersion: string | null;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SignInResult extends SessionTokens {
  riderId: string;
  isNewRider: boolean;
  /** True until the rider picks a username. */
  needsOnboarding: boolean;
}

export interface ResolvedRider {
  riderId: string;
  isNewRider: boolean;
  needsOnboarding: boolean;
  roles: readonly string[];
}

export type { VerifiedIdentity };

/** Versions of the legal documents the client displayed, from config. */
export interface ConsentVersions {
  terms: string;
  privacy: string;
}

/** One rate-limit rule: `limit` events per `windowSeconds`. */
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Limits for the email code flow. Per-address rules stop one inbox being
 * spammed; per-IP rules stop one caller enumerating many addresses.
 */
export interface OtpRateLimits {
  startPerEmailShort: RateLimitRule;
  startPerEmailDaily: RateLimitRule;
  startPerIp: RateLimitRule;
  verifyPerIp: RateLimitRule;
}

export interface AuthPolicy {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpCodeLength: number;
  refreshTokenBytes: number;
  consent: ConsentVersions;
  otpRateLimits: OtpRateLimits;
}
