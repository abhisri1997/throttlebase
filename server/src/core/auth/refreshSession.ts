import type { RiderRepository } from "../../ports/RiderRepository.js";
import { AuthError } from "./errors.js";
import { mintTokens, type IssueSessionDeps } from "./issueSession.js";
import type { RequestContext, SessionTokens } from "./types.js";

export interface RefreshSessionDeps extends IssueSessionDeps {
  riders: RiderRepository;
}

export interface RefreshSessionInput {
  refreshToken: string;
  ctx: RequestContext;
}

/**
 * Exchanges a refresh token for a fresh pair, rotating on every use.
 *
 * Rotation makes a stolen token detectable: the legitimate client and the
 * thief cannot both present the same token, so the second presentation is
 * evidence of compromise and kills the whole family rather than just the one
 * token. This is why the client must never run two refreshes concurrently.
 */
export const refreshSession = async (
  deps: RefreshSessionDeps,
  input: RefreshSessionInput,
): Promise<SessionTokens & { riderId: string }> => {
  const now = deps.clock.now();
  const presentedHash = deps.hasher.sha256Hex(input.refreshToken);
  const session = await deps.sessions.findByRefreshTokenHash(presentedHash);

  if (!session) {
    throw new AuthError("REFRESH_TOKEN_INVALID", "Refresh token is not valid.");
  }

  if (session.replacedBy !== null) {
    // This token was already rotated away. Either it leaked, or a client
    // raced itself. Either way the family can no longer be trusted.
    await deps.sessions.revokeFamily(session.familyId, session.riderId, now);
    throw new AuthError(
      "REFRESH_TOKEN_REUSED",
      "Refresh token was already used. All sessions in this family have been revoked.",
    );
  }

  if (session.revokedAt !== null) {
    throw new AuthError("REFRESH_TOKEN_INVALID", "Session has been revoked.");
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError("REFRESH_TOKEN_INVALID", "Session has expired.");
  }

  const roles = await deps.riders.withTransaction((tx) =>
    tx.getRoles(session.riderId),
  );

  const tokens = await mintTokens(deps, {
    riderId: session.riderId,
    roles,
    familyId: session.familyId,
    ctx: input.ctx,
    now,
    persist: async (record) => {
      await deps.sessions.rotate({
        currentSessionId: session.id,
        next: record,
        at: now,
      });
    },
  });

  return { ...tokens, riderId: session.riderId };
};
