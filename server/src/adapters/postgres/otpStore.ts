import type pg from "pg";
import type {
  CreateOtpInput,
  OtpRecord,
  OtpStore,
} from "../../ports/OtpStore.js";

interface OtpRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  consumed_at: Date | null;
  created_at: Date;
}

const toRecord = (row: OtpRow): OtpRecord => ({
  id: row.id,
  email: row.email,
  codeHash: row.code_hash,
  expiresAt: row.expires_at,
  attempts: row.attempts,
  consumedAt: row.consumed_at,
  createdAt: row.created_at,
});

const COLUMNS = "id, email, code_hash, expires_at, attempts, consumed_at, created_at";

/**
 * Sign-in codes.
 *
 * Every query here runs without a rider context, by necessity: these rows are
 * consulted before anyone is authenticated, and are keyed by email address
 * rather than rider. Migration 028 gives the table a permissive policy for
 * that reason, which is safe because it stores digests and expiry times, not
 * secrets.
 */
export const createOtpStore = (pool: pg.Pool): OtpStore => ({
  invalidateOutstanding: async (email: string, at: Date): Promise<void> => {
    await pool.query(
      `UPDATE email_otps SET consumed_at = $2
        WHERE email = $1 AND consumed_at IS NULL`,
      [email, at],
    );
  },

  create: async (input: CreateOtpInput): Promise<OtpRecord> => {
    const result = await pool.query<OtpRow>(
      `INSERT INTO email_otps (email, code_hash, expires_at, ip)
       VALUES ($1, $2, $3, $4::inet)
       RETURNING ${COLUMNS}`,
      [input.email, input.codeHash, input.expiresAt, input.ip],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("OTP insert returned no row");
    }
    return toRecord(row);
  },

  findLatestUnconsumed: async (email: string): Promise<OtpRecord | null> => {
    const result = await pool.query<OtpRow>(
      `SELECT ${COLUMNS} FROM email_otps
        WHERE email = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  },

  /**
   * Increments and returns the new count in one statement.
   *
   * Read-then-write would let two concurrent guesses both read the same
   * count and each believe it was within the limit, which is exactly the race
   * an attacker would use to buy extra attempts.
   */
  incrementAttempts: async (id: string): Promise<number> => {
    const result = await pool.query<{ attempts: number }>(
      "UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
      [id],
    );

    const attempts = result.rows[0]?.attempts;
    if (attempts === undefined) {
      throw new Error(`No OTP record ${id}`);
    }
    return attempts;
  },

  consume: async (id: string, at: Date): Promise<void> => {
    await pool.query("UPDATE email_otps SET consumed_at = $2 WHERE id = $1", [
      id,
      at,
    ]);
  },
});
