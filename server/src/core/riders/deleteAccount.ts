import type { Clock } from "../../ports/Clock.js";
import type { RiderRepository } from "../../ports/RiderRepository.js";
import type { SessionRepository } from "../../ports/SessionRepository.js";
import { AuthError } from "../auth/errors.js";

export interface DeleteAccountDeps {
  riders: RiderRepository;
  sessions: SessionRepository;
  clock: Clock;
}

/**
 * Account deletion, as the app stores require.
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
  riderId: string,
): Promise<void> => {
  const now = deps.clock.now();
  const deleted = await deps.riders.softDeleteAndUnlink(riderId, now);

  if (!deleted) {
    throw new AuthError("RIDER_NOT_FOUND", "Account not found.");
  }

  await deps.sessions.revokeAllForRider(riderId, now);
};
