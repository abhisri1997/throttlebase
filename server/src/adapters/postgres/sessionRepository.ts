import type pg from "pg";
import type {
  CreateSessionInput,
  SessionRecord,
  SessionRepository,
} from "../../ports/SessionRepository.js";
import { withRiderTransaction } from "./requestContext.js";

interface SessionRow {
  id: string;
  rider_id: string;
  family_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
  last_used_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
}

const COLUMNS =
  "id, rider_id, family_id, refresh_token_hash, expires_at, revoked_at, replaced_by, last_used_at, user_agent, ip_address::text AS ip_address, created_at";

const toRecord = (row: SessionRow): SessionRecord => ({
  id: row.id,
  riderId: row.rider_id,
  familyId: row.family_id,
  refreshTokenHash: row.refresh_token_hash,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  replacedBy: row.replaced_by,
  lastUsedAt: row.last_used_at,
  userAgent: row.user_agent,
  ipAddress: row.ip_address,
  createdAt: row.created_at,
});

const insert = async (
  client: pg.PoolClient,
  input: CreateSessionInput,
): Promise<SessionRecord> => {
  const result = await client.query<SessionRow>(
    `INSERT INTO sessions
       (rider_id, family_id, refresh_token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6::inet)
     RETURNING ${COLUMNS}`,
    [
      input.riderId,
      input.familyId,
      input.refreshTokenHash,
      input.expiresAt,
      input.userAgent,
      input.ipAddress,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Session insert returned no row");
  }
  return toRecord(row);
};

export const createSessionRepository = (pool: pg.Pool): SessionRepository => ({
  create: (input: CreateSessionInput): Promise<SessionRecord> =>
    withRiderTransaction(pool, input.riderId, (client) => insert(client, input)),

  /**
   * Looked up by digest, before the caller is authenticated.
   *
   * This is the one session query that cannot be scoped by app.rider_id: the
   * token is what proves who the caller is, so there is no identity to filter
   * by yet. Under the row policy a plain SELECT here would match nothing and
   * refresh would always fail.
   *
   * It therefore goes through app.session_by_refresh_hash(), a
   * SECURITY DEFINER function (migration 030) that returns at most the single
   * row whose digest was presented. That is a deliberate, auditable hole of
   * exactly one row wide, rather than relaxing the policy on the whole table:
   * holding the digest is already equivalent to holding the token.
   */
  findByRefreshTokenHash: async (hash: string): Promise<SessionRecord | null> => {
    const result = await pool.query<SessionRow>(
      "SELECT * FROM app.session_by_refresh_hash($1)",
      [hash],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  },

  /**
   * Rotation, as one atomic step.
   *
   * Marking the old row replaced and inserting its successor must not be
   * separable: a crash between them would either strand the family with no
   * live token, or leave two live tokens, which reuse detection would later
   * read as a theft.
   */
  rotate: async (input: {
    currentSessionId: string;
    next: CreateSessionInput;
    at: Date;
  }): Promise<SessionRecord> =>
    await withRiderTransaction(pool, input.next.riderId, async (client) => {
      const next = await insert(client, input.next);

      const updated = await client.query(
        `UPDATE sessions
            SET replaced_by = $2, last_used_at = $3
          WHERE id = $1 AND replaced_by IS NULL`,
        [input.currentSessionId, next.id, input.at],
      );

      if ((updated.rowCount ?? 0) === 0) {
        // Another request rotated this token while we were working. Aborting
        // is the safe answer: the caller sees a failed refresh and retries,
        // rather than two live successors existing.
        throw new Error("Refresh token was rotated concurrently");
      }

      return next;
    }),

  revokeFamily: async (
    familyId: string,
    riderId: string,
    at: Date,
  ): Promise<number> =>
    await withRiderTransaction(pool, riderId, async (client) => {
      const result = await client.query(
        "UPDATE sessions SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL",
        [familyId, at],
      );
      return result.rowCount ?? 0;
    }),

  revokeAllForRider: async (riderId: string, at: Date): Promise<number> =>
    await withRiderTransaction(pool, riderId, async (client) => {
      const result = await client.query(
        "UPDATE sessions SET revoked_at = $2 WHERE rider_id = $1 AND revoked_at IS NULL",
        [riderId, at],
      );
      return result.rowCount ?? 0;
    }),
});
