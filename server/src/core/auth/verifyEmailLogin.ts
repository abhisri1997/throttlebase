import type { OtpStore } from "../../ports/OtpStore.js";
import type { VerifiedIdentity } from "../../ports/IdentityVerifier.js";
import { AuthError } from "./errors.js";
import { normalizeEmail } from "./email.js";
import { issueSession, type IssueSessionDeps } from "./issueSession.js";
import {
  resolveOrCreateRider,
  type ResolveRiderDeps,
} from "./resolveOrCreateRider.js";
import type { RateLimiter } from "./rateLimitTypes.js";
import type { RequestContext, SignInResult } from "./types.js";

export interface VerifyEmailLoginDeps
  extends IssueSessionDeps,
    ResolveRiderDeps {
  otps: OtpStore;
  rateLimiter: RateLimiter;
}

export interface VerifyEmailLoginInput {
  email: string;
  code: string;
  ctx: RequestContext;
}

/**
 * Exchanges a valid code for a session, creating the rider if this is their
 * first sign-in.
 */
export const verifyEmailLogin = async (
  deps: VerifyEmailLoginDeps,
  input: VerifyEmailLoginInput,
): Promise<SignInResult> => {
  const now = deps.clock.now();
  const address = normalizeEmail(input.email);

  if (input.ctx.ipAddress) {
    const rule = deps.policy.otpRateLimits.verifyPerIp;
    const decision = await deps.rateLimiter.consume({
      bucket: "email_otp_verify_ip",
      subject: input.ctx.ipAddress,
      limit: rule.limit,
      windowSeconds: rule.windowSeconds,
      now,
    });

    if (!decision.allowed) {
      throw new AuthError(
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
        decision.retryAfterSeconds,
      );
    }
  }

  const record = await deps.otps.findLatestUnconsumed(address);

  if (!record) {
    throw new AuthError("OTP_INVALID", "That code is not valid.");
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError("OTP_EXPIRED", "That code has expired.");
  }

  // Count the attempt before comparing, so a crash mid-verify cannot be used
  // to retry for free.
  const attempts = await deps.otps.incrementAttempts(record.id);

  if (attempts > deps.policy.otpMaxAttempts) {
    await deps.otps.consume(record.id, now);
    throw new AuthError(
      "OTP_ATTEMPTS_EXCEEDED",
      "Too many incorrect attempts. Request a new code.",
    );
  }

  const presentedHash = deps.hasher.sha256Hex(input.code.trim());

  if (!deps.hasher.timingSafeEqual(presentedHash, record.codeHash)) {
    throw new AuthError("OTP_INVALID", "That code is not valid.");
  }

  await deps.otps.consume(record.id, now);

  // Reaching this point is itself proof of control of the inbox, which is
  // what "verified" means for the linking rules downstream.
  const identity: VerifiedIdentity = {
    provider: "email",
    subject: address,
    email: address,
    emailVerified: true,
    displayName: null,
    avatarUrl: null,
  };

  const resolved = await resolveOrCreateRider(deps, identity, input.ctx);

  const tokens = await issueSession(deps, {
    riderId: resolved.riderId,
    roles: resolved.roles,
    ctx: input.ctx,
  });

  return {
    ...tokens,
    riderId: resolved.riderId,
    isNewRider: resolved.isNewRider,
    needsOnboarding: resolved.needsOnboarding,
  };
};
