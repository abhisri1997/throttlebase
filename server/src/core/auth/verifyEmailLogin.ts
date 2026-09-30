import type { OtpStore } from "../../ports/OtpStore.js";
import type { VerifiedIdentity } from "../../ports/IdentityVerifier.js";
import { enforceRateLimit, redeemEmailCode } from "./emailCode.js";
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
    await enforceRateLimit(
      deps,
      {
        bucket: "email_otp_verify_ip",
        subject: input.ctx.ipAddress,
        rule: deps.policy.otpRateLimits.verifyPerIp,
        message: "Too many attempts. Try again later.",
      },
      now,
    );
  }

  await redeemEmailCode(deps, { address, code: input.code });

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
