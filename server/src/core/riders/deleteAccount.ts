import type { RiderRepository } from "../../ports/RiderRepository.js";
import type { SessionRepository } from "../../ports/SessionRepository.js";
import { AuthError } from "../auth/errors.js";
import {
  enforceCodeLimitForIp,
  enforceCodeLimitsForAddress,
  enforceVerifyLimitForIp,
  redeemEmailCode,
  sendEmailCode,
  type EmailCodeDeps,
} from "../auth/emailCode.js";
import { isPlausibleEmail, normalizeEmail } from "../auth/email.js";
import type { RequestContext } from "../auth/types.js";
import { buildDeletionCodeEmail, buildNoAccountEmail } from "./deletionEmails.js";

export interface DeleteAccountDeps extends EmailCodeDeps {
  riders: RiderRepository;
  sessions: SessionRepository;
}

/**
 * The address a deletion code goes to: the one on the rider's own row, never
 * one the caller supplies. Throws when the rider is gone or has none.
 */
const addressOnFile = async (
  deps: Pick<DeleteAccountDeps, "riders">,
  riderId: string,
): Promise<string> => {
  const rider = await deps.riders.withTransaction((tx) =>
    tx.findRiderById(riderId),
  );

  if (!rider) {
    throw new AuthError("RIDER_NOT_FOUND", "Account not found.");
  }

  if (!rider.email) {
    throw new AuthError(
      "NO_EMAIL_ON_FILE",
      "We can't confirm this by email. Contact support to delete your account.",
    );
  }

  return normalizeEmail(rider.email);
};

/**
 * Emails the signed-in rider a code that confirms deleting their account.
 *
 * A valid session is not enough on its own: a stolen token or an unlocked
 * phone would be. The code proves control of the inbox too.
 */
export const requestDeletionCode = async (
  deps: DeleteAccountDeps,
  input: { riderId: string; ctx: RequestContext },
): Promise<{ expiresInSeconds: number }> => {
  const address = await addressOnFile(deps, input.riderId);

  await enforceCodeLimitsForAddress(deps, address, deps.clock.now());
  await sendEmailCode(deps, {
    address,
    ip: input.ctx.ipAddress,
    buildEmail: (code, expiresInMinutes) =>
      buildDeletionCodeEmail({ to: address, code, expiresInMinutes }),
  });

  return { expiresInSeconds: deps.policy.otpTtlSeconds };
};

/**
 * Account deletion, as the app stores require, confirmed by the emailed code
 * from `requestDeletionCode`.
 *
 * What goes: every linked identity, so no provider can sign back in, and
 * every refresh family, so existing devices lose access immediately.
 *
 * What stays: the rider row, soft-deleted and with personal fields cleared.
 * Rides, participation and safety records reference it, and other riders'
 * history would be corrupted by a hard delete. The retained row carries no
 * name, email, avatar or location once anonymised.
 */
export const deleteAccount = async (
  deps: DeleteAccountDeps,
  input: { riderId: string; code: string | null },
): Promise<void> => {
  const address = await addressOnFile(deps, input.riderId);

  if (!input.code) {
    throw new AuthError(
      "REAUTH_REQUIRED",
      "Enter the code we emailed you to delete your account.",
    );
  }

  await redeemEmailCode(deps, { address, code: input.code });

  if (!(await removeRider(deps, input.riderId))) {
    throw new AuthError("RIDER_NOT_FOUND", "Account not found.");
  }
};

/** The deletion itself, once the code has been redeemed. False if already gone. */
const removeRider = async (
  deps: DeleteAccountDeps,
  riderId: string,
): Promise<boolean> => {
  const now = deps.clock.now();
  const deleted = await deps.riders.softDeleteAndUnlink(riderId, now);

  if (deleted) {
    await deps.sessions.revokeAllForRider(riderId, now);
  }

  return deleted;
};

const riderIdByEmail = async (
  deps: Pick<DeleteAccountDeps, "riders">,
  address: string,
): Promise<string | null> => {
  const rider = await deps.riders.withTransaction((tx) =>
    tx.findRiderByEmail(address),
  );
  return rider?.id ?? null;
};

/**
 * The signed-out path, for throttlebase.in/delete-account: emails a deletion
 * code to `email` if it has an account, and otherwise says there is none.
 *
 * The answer is the same either way, so the page cannot be used to learn
 * whether an address has an account. Only the inbox's owner finds out.
 */
export const requestDeletionCodeByEmail = async (
  deps: DeleteAccountDeps,
  input: { email: string; ctx: RequestContext },
): Promise<{ accepted: true; expiresInSeconds: number }> => {
  const now = deps.clock.now();
  const address = normalizeEmail(input.email);

  await enforceCodeLimitsForAddress(deps, address, now);
  if (input.ctx.ipAddress) {
    await enforceCodeLimitForIp(deps, input.ctx.ipAddress, now);
  }

  const uniform = { accepted: true as const, expiresInSeconds: deps.policy.otpTtlSeconds };

  if (!isPlausibleEmail(address)) {
    return uniform;
  }

  if ((await riderIdByEmail(deps, address)) === null) {
    await deps.email.send(buildNoAccountEmail({ to: address }));
    return uniform;
  }

  await sendEmailCode(deps, {
    address,
    ip: input.ctx.ipAddress,
    buildEmail: (code, expiresInMinutes) =>
      buildDeletionCodeEmail({ to: address, code, expiresInMinutes }),
  });

  return uniform;
};

/**
 * Deletes the account at `email` with the code sent to it. Holding the code
 * proves control of the inbox, so saying whether there was an account to
 * delete tells nobody anything they couldn't learn from the inbox itself.
 */
export const deleteAccountByEmail = async (
  deps: DeleteAccountDeps,
  input: { email: string; code: string; ctx: RequestContext },
): Promise<{ deleted: boolean }> => {
  const address = normalizeEmail(input.email);

  if (input.ctx.ipAddress) {
    await enforceVerifyLimitForIp(deps, input.ctx.ipAddress, deps.clock.now());
  }

  await redeemEmailCode(deps, { address, code: input.code });

  const riderId = await riderIdByEmail(deps, address);
  return { deleted: riderId !== null && (await removeRider(deps, riderId)) };
};
