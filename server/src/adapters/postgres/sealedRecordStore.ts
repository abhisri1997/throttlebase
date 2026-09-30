/**
 * The operator's side of sealed registration records (migration 043): opening
 * one for a lawful request, and holding one past its 180 days. Never reached
 * from the API; only the command-line tool (sealedRecordsCli.ts) calls these.
 *
 * Every opening and every hold is written to sealed.access_log, with who and
 * why, before anything is revealed.
 */
import type pg from "pg";
import type { RegistrationRecord } from "../../core/riders/registrationRecord.js";
import { keyIdOf, openBox, type SealedBox } from "../crypto/sealedBox.js";

export class SealedRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealedRecordError";
  }
}

/** Who is asking, and on what grounds: both are recorded. */
export interface Requester {
  actor: string;
  reason: string;
}

const requireRequester = ({ actor, reason }: Requester): void => {
  if (!actor.trim()) throw new SealedRecordError("Say who is doing this (--actor).");
  if (!reason.trim()) throw new SealedRecordError("Give the reason, such as the order's reference (--reason).");
};

const log = (client: pg.Pool | pg.PoolClient, riderId: string, action: string, who: Requester) =>
  client.query(`INSERT INTO sealed.access_log (rider_id, action, reason, actor) VALUES ($1, $2, $3, $4)`, [
    riderId,
    action,
    who.reason.trim(),
    who.actor.trim(),
  ]);

/** Opens a record with the private key it was sealed for. The opening is logged first. */
export const openSealedRecord = async (
  pool: pg.Pool,
  riderId: string,
  privateKeyPem: string,
  who: Requester,
): Promise<RegistrationRecord> => {
  requireRequester(who);
  const result = await pool.query(`SELECT key_id, sealed FROM sealed.registration_records WHERE rider_id = $1`, [riderId]);
  const row = result.rows[0] as { key_id: string; sealed: SealedBox } | undefined;
  if (!row) throw new SealedRecordError("No sealed record for that rider: none was made, or it was purged.");

  const keyId = keyIdOf(privateKeyPem);
  if (keyId !== row.key_id) {
    throw new SealedRecordError(`This record was sealed with key ${row.key_id}; the key given is ${keyId}.`);
  }

  await log(pool, riderId, "opened", who);
  return JSON.parse(openBox(row.sealed, privateKeyPem)) as RegistrationRecord;
};

const inTransaction = async <T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/** Keeps a record past its 180 days, until `until`, for a legal reason. */
export const setLegalHold = (pool: pg.Pool, riderId: string, until: Date, who: Requester): Promise<void> =>
  inTransaction(pool, async (client) => {
    requireRequester(who);
    const updated = await client.query(
      `UPDATE sealed.registration_records SET legal_hold_until = $2, legal_hold_reason = $3 WHERE rider_id = $1`,
      [riderId, until, who.reason.trim()],
    );
    if (updated.rowCount === 0) throw new SealedRecordError("No sealed record for that rider.");
    await log(client, riderId, "hold_set", who);
  });

/** Ends a legal hold: the record goes with the next daily purge once past its 180 days. */
export const releaseLegalHold = (pool: pg.Pool, riderId: string, who: Requester): Promise<void> =>
  inTransaction(pool, async (client) => {
    requireRequester(who);
    const updated = await client.query(
      `UPDATE sealed.registration_records SET legal_hold_until = NULL, legal_hold_reason = NULL WHERE rider_id = $1`,
      [riderId],
    );
    if (updated.rowCount === 0) throw new SealedRecordError("No sealed record for that rider.");
    await log(client, riderId, "hold_released", who);
  });
