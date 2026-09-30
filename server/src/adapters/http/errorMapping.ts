import type { Response } from "express";
import { isAuthError, type AuthErrorCode } from "../../core/auth/errors.js";
import { clientIpOf, type ClientIpRequest } from "./clientIp.js";

/**
 * Maps core's vocabulary onto HTTP.
 *
 * Core raises domain errors and knows nothing about status codes; this table
 * is the only place the translation happens. Messages are deliberately terse
 * — they are shown to riders, and an authentication failure should never
 * explain which part of the attempt was wrong.
 */
const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  INVALID_CREDENTIAL: 401,
  IDENTITY_UNVERIFIED: 401,
  OTP_INVALID: 401,
  OTP_EXPIRED: 401,
  OTP_ATTEMPTS_EXCEEDED: 429,
  RATE_LIMITED: 429,
  REFRESH_TOKEN_INVALID: 401,
  REFRESH_TOKEN_REUSED: 401,
  CONSENT_REQUIRED: 422,
  USERNAME_INVALID: 400,
  USERNAME_TAKEN: 409,
  RIDER_NOT_FOUND: 404,
  ACCOUNT_SUSPENDED: 403,
  REAUTH_REQUIRED: 403,
  NO_EMAIL_ON_FILE: 409,
};

/**
 * For routes already behind a valid access token. A code refused there says
 * nothing about the token, and a 401 would make the app refresh it and resend
 * the same code, spending a second attempt.
 */
export const SIGNED_IN_CODE_STATUS: Partial<Record<AuthErrorCode, number>> = {
  OTP_INVALID: 403,
  OTP_EXPIRED: 403,
};

export const sendAuthError = (
  res: Response,
  error: unknown,
  overrides: Partial<Record<AuthErrorCode, number>> = {},
): void => {
  if (isAuthError(error)) {
    const status = overrides[error.code] ?? STATUS_BY_CODE[error.code];

    if (error.retryAfterSeconds !== undefined) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }

    res.status(status).json({ error: error.message, code: error.code });
    return;
  }

  // An unexpected failure is logged in full and reported as nothing.
  console.error("[auth] unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
};

/** Client IP and user agent, as core's RequestContext wants them. */
export const requestContextFrom = (req: ClientIpRequest & {
  body?: unknown;
}): { ipAddress: string | null; userAgent: string | null } => {
  const agent = req.headers["user-agent"];
  const agentValue = Array.isArray(agent) ? agent[0] : agent;

  return {
    ipAddress: clientIpOf(req),
    userAgent: agentValue ? agentValue.slice(0, 255) : null,
  };
};
