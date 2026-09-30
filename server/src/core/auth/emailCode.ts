import type { Clock } from "../../ports/Clock.js";
import type { EmailSender, OutgoingEmail } from "../../ports/EmailSender.js";
import type { Hasher } from "../../ports/Hasher.js";
import type { OtpStore } from "../../ports/OtpStore.js";
import type { RandomSource } from "../../ports/RandomSource.js";
import type { RateLimiter, RateLimitRule } from "./rateLimitTypes.js";
import { AuthError } from "./errors.js";
import type { AuthPolicy } from "./types.js";

/**
 * One-time codes emailed to an address, shared by sign-in and account
 * deletion. Both prove the same thing, control of the inbox, so they share one
 * store and one live code per address: issuing either retires the other.
 */

export interface EmailCodeDeps {
  otps: OtpStore;
  email: EmailSender;
  hasher: Hasher;
  random: RandomSource;
  clock: Clock;
  rateLimiter: RateLimiter;
  policy: AuthPolicy;
}

export type RedeemEmailCodeDeps = Pick<
  EmailCodeDeps,
  "otps" | "hasher" | "clock" | "policy"
>;

type RateLimitDeps = Pick<EmailCodeDeps, "rateLimiter" | "policy">;

/** Throws RATE_LIMITED when `subject` has used up `rule` in `bucket`. */
export const enforceRateLimit = async (
  deps: Pick<EmailCodeDeps, "rateLimiter">,
  limit: { bucket: string; subject: string; rule: RateLimitRule; message: string },
  now: Date,
): Promise<void> => {
  const decision = await deps.rateLimiter.consume({
    bucket: limit.bucket,
    subject: limit.subject,
    limit: limit.rule.limit,
    windowSeconds: limit.rule.windowSeconds,
    now,
  });

  if (!decision.allowed) {
    throw new AuthError("RATE_LIMITED", limit.message, decision.retryAfterSeconds);
  }
};

const CODE_REQUEST_LIMITED = "Too many code requests. Try again later.";

/**
 * Per-address limits on sending codes. They count every code sent to one
 * inbox, whatever it was for, so mixing flows cannot flood it.
 */
export const enforceCodeLimitsForAddress = async (
  deps: RateLimitDeps,
  address: string,
  now: Date,
): Promise<void> => {
  const limits = deps.policy.otpRateLimits;
  const message = CODE_REQUEST_LIMITED;
  await enforceRateLimit(deps, { bucket: "email_otp_start_short", subject: address, rule: limits.startPerEmailShort, message }, now);
  await enforceRateLimit(deps, { bucket: "email_otp_start_daily", subject: address, rule: limits.startPerEmailDaily, message }, now);
};

export const enforceCodeLimitForIp = async (
  deps: RateLimitDeps,
  ip: string,
  now: Date,
): Promise<void> => {
  await enforceRateLimit(
    deps,
    {
      bucket: "email_otp_start_ip",
      subject: ip,
      rule: deps.policy.otpRateLimits.startPerIp,
      message: CODE_REQUEST_LIMITED,
    },
    now,
  );
};

/** Per-IP limit on attempts to redeem a code, whatever it was for. */
export const enforceVerifyLimitForIp = async (
  deps: RateLimitDeps,
  ip: string,
  now: Date,
): Promise<void> => {
  await enforceRateLimit(
    deps,
    {
      bucket: "email_otp_verify_ip",
      subject: ip,
      rule: deps.policy.otpRateLimits.verifyPerIp,
      message: "Too many attempts. Try again later.",
    },
    now,
  );
};

/**
 * Stores a digest of a fresh code and emails the code itself. `address` must
 * already be normalised; `buildEmail` supplies the wording for the flow.
 */
export const sendEmailCode = async (
  deps: EmailCodeDeps,
  input: {
    address: string;
    ip: string | null;
    buildEmail: (code: string, expiresInMinutes: number) => OutgoingEmail;
  },
): Promise<void> => {
  const now = deps.clock.now();
  const code = deps.random.digits(deps.policy.otpCodeLength);
  const expiresAt = new Date(now.getTime() + deps.policy.otpTtlSeconds * 1000);

  // Issuing a new code retires any earlier one, so a rider who asks twice
  // cannot be confused about which code is live.
  await deps.otps.invalidateOutstanding(input.address, now);
  await deps.otps.create({
    email: input.address,
    codeHash: deps.hasher.sha256Hex(code),
    expiresAt,
    ip: input.ip,
  });

  await deps.email.send(
    input.buildEmail(code, Math.round(deps.policy.otpTtlSeconds / 60)),
  );
};

/**
 * Checks `code` against the live code for `address` and spends it. Throws
 * OTP_INVALID, OTP_EXPIRED or OTP_ATTEMPTS_EXCEEDED otherwise.
 */
export const redeemEmailCode = async (
  deps: RedeemEmailCodeDeps,
  input: { address: string; code: string },
): Promise<void> => {
  const now = deps.clock.now();
  const record = await deps.otps.findLatestUnconsumed(input.address);

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
};
