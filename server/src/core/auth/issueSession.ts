import type { Clock } from "../../ports/Clock.js";
import type { Hasher } from "../../ports/Hasher.js";
import type { RandomSource } from "../../ports/RandomSource.js";
import type { SessionRepository } from "../../ports/SessionRepository.js";
import type { TokenIssuer } from "../../ports/TokenIssuer.js";
import type { AuthPolicy, RequestContext, SessionTokens } from "./types.js";

export interface IssueSessionDeps {
  tokenIssuer: TokenIssuer;
  sessions: SessionRepository;
  hasher: Hasher;
  random: RandomSource;
  clock: Clock;
  policy: AuthPolicy;
}

export interface IssueSessionInput {
  riderId: string;
  roles: readonly string[];
  ctx: RequestContext;
}

/**
 * Mints one access token and one refresh token for a brand-new session family.
 *
 * The refresh token is returned to the caller but only ever stored as a
 * SHA-256 digest, so a database disclosure does not yield usable tokens.
 */
export const issueSession = async (
  deps: IssueSessionDeps,
  input: IssueSessionInput,
): Promise<SessionTokens> => {
  const now = deps.clock.now();
  const familyId = deps.random.uuid();

  return await mintTokens(deps, {
    riderId: input.riderId,
    roles: input.roles,
    familyId,
    ctx: input.ctx,
    now,
    persist: async (record) => {
      await deps.sessions.create(record);
    },
  });
};

export interface MintInput {
  riderId: string;
  roles: readonly string[];
  familyId: string;
  ctx: RequestContext;
  now: Date;
  persist: (record: {
    riderId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }) => Promise<void>;
}

/**
 * Shared by first issue and rotation: both mint the same token pair, and
 * differ only in how the new row is persisted.
 */
export const mintTokens = async (
  deps: IssueSessionDeps,
  input: MintInput,
): Promise<SessionTokens> => {
  const refreshToken = deps.random.token(deps.policy.refreshTokenBytes);
  const refreshTokenHash = deps.hasher.sha256Hex(refreshToken);
  const refreshTokenExpiresAt = new Date(
    input.now.getTime() + deps.policy.refreshTokenTtlSeconds * 1000,
  );

  await input.persist({
    riderId: input.riderId,
    familyId: input.familyId,
    refreshTokenHash,
    expiresAt: refreshTokenExpiresAt,
    userAgent: input.ctx.userAgent,
    ipAddress: input.ctx.ipAddress,
  });

  const access = await deps.tokenIssuer.issueAccessToken({
    riderId: input.riderId,
    roles: input.roles,
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  };
};
