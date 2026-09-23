import type { Clock } from "../../ports/Clock.js";
import type { EmailSender } from "../../ports/EmailSender.js";
import type { Hasher } from "../../ports/Hasher.js";
import type { OtpStore } from "../../ports/OtpStore.js";
import type { RandomSource } from "../../ports/RandomSource.js";
import type { RateLimiter, RateLimitRule } from "./rateLimitTypes.js";
import { AuthError } from "./errors.js";
import { isPlausibleEmail, normalizeEmail } from "./email.js";
import { buildOtpEmail } from "./otpEmail.js";
import type { AuthPolicy, RequestContext } from "./types.js";

export interface StartEmailLoginDeps {
  otps: OtpStore;
  email: EmailSender;
  hasher: Hasher;
  random: RandomSource;
  clock: Clock;
  rateLimiter: RateLimiter;
  policy: AuthPolicy;
}

export interface StartEmailLoginInput {
  email: string;
  ctx: RequestContext;
}

export interface StartEmailLoginResult {
  /** Always the same, whatever happened. See the note below. */
  accepted: true;
  expiresInSeconds: number;
}

/**
 * Sends a one-time code to an address.
 *
 * The result is identical whether the address belongs to an existing rider,
 * is brand new, or is not deliverable at all. Any observable difference —
 * status code, body, or latency pattern — would turn this endpoint into an
 * account-existence oracle. Rate limiting still rejects loudly, because being
 * told "too many requests" reveals nothing about who owns the address.
 */
export const startEmailLogin = async (
  deps: StartEmailLoginDeps,
  input: StartEmailLoginInput,
): Promise<StartEmailLoginResult> => {
  const now = deps.clock.now();
  const address = normalizeEmail(input.email);
  const limits = deps.policy.otpRateLimits;

  await enforce(deps, "email_otp_start_short", address, limits.startPerEmailShort, now);
  await enforce(deps, "email_otp_start_daily", address, limits.startPerEmailDaily, now);

  if (input.ctx.ipAddress) {
    await enforce(deps, "email_otp_start_ip", input.ctx.ipAddress, limits.startPerIp, now);
  }

  const uniform: StartEmailLoginResult = {
    accepted: true,
    expiresInSeconds: deps.policy.otpTtlSeconds,
  };

  if (!isPlausibleEmail(address)) {
    return uniform;
  }

  const code = deps.random.digits(deps.policy.otpCodeLength);
  const expiresAt = new Date(now.getTime() + deps.policy.otpTtlSeconds * 1000);

  // Issuing a new code retires any earlier one, so a rider who asks twice
  // cannot be confused about which code is live.
  await deps.otps.invalidateOutstanding(address, now);
  await deps.otps.create({
    email: address,
    codeHash: deps.hasher.sha256Hex(code),
    expiresAt,
    ip: input.ctx.ipAddress,
  });

  await deps.email.send(
    buildOtpEmail({
      to: address,
      code,
      expiresInMinutes: Math.round(deps.policy.otpTtlSeconds / 60),
    }),
  );

  return uniform;
};

const enforce = async (
  deps: StartEmailLoginDeps,
  bucket: string,
  subject: string,
  rule: RateLimitRule,
  now: Date,
): Promise<void> => {
  const decision = await deps.rateLimiter.consume({
    bucket,
    subject,
    limit: rule.limit,
    windowSeconds: rule.windowSeconds,
    now,
  });

  if (!decision.allowed) {
    throw new AuthError(
      "RATE_LIMITED",
      "Too many code requests. Try again later.",
      decision.retryAfterSeconds,
    );
  }
};
