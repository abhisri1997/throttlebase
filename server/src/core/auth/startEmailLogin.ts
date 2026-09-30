import {
  enforceCodeLimitForIp,
  enforceCodeLimitsForAddress,
  sendEmailCode,
  type EmailCodeDeps,
} from "./emailCode.js";
import { isPlausibleEmail, normalizeEmail } from "./email.js";
import { buildOtpEmail } from "./otpEmail.js";
import type { RequestContext } from "./types.js";

export type StartEmailLoginDeps = EmailCodeDeps;

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

  await enforceCodeLimitsForAddress(deps, address, now);

  if (input.ctx.ipAddress) {
    await enforceCodeLimitForIp(deps, input.ctx.ipAddress, now);
  }

  const uniform: StartEmailLoginResult = {
    accepted: true,
    expiresInSeconds: deps.policy.otpTtlSeconds,
  };

  if (!isPlausibleEmail(address)) {
    return uniform;
  }

  await sendEmailCode(deps, {
    address,
    ip: input.ctx.ipAddress,
    buildEmail: (code, expiresInMinutes) =>
      buildOtpEmail({ to: address, code, expiresInMinutes }),
  });

  return uniform;
};
