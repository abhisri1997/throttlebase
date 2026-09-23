import type { Clock } from "../../ports/Clock.js";
import type { Hasher } from "../../ports/Hasher.js";
import type { SessionRepository } from "../../ports/SessionRepository.js";

export interface LogoutDeps {
  sessions: SessionRepository;
  hasher: Hasher;
  clock: Clock;
}

/**
 * Revokes the family the presented token belongs to.
 *
 * An unknown token is not an error: logging out is idempotent, and telling a
 * caller their token was unrecognised leaks nothing useful to them and
 * something useful to an attacker.
 */
export const logout = async (
  deps: LogoutDeps,
  refreshToken: string,
): Promise<{ revoked: number }> => {
  const hash = deps.hasher.sha256Hex(refreshToken);
  const session = await deps.sessions.findByRefreshTokenHash(hash);

  if (!session) {
    return { revoked: 0 };
  }

  const revoked = await deps.sessions.revokeFamily(
    session.familyId,
    session.riderId,
    deps.clock.now(),
  );
  return { revoked };
};

/** Revokes every family for a rider — "sign out everywhere". */
export const logoutAll = async (
  deps: LogoutDeps,
  riderId: string,
): Promise<{ revoked: number }> => {
  const revoked = await deps.sessions.revokeAllForRider(
    riderId,
    deps.clock.now(),
  );
  return { revoked };
};
