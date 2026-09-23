import type pg from "pg";

/**
 * Establishes which rider the current transaction is acting as.
 *
 * `set_config(..., true)` is transaction-local. That matters more than it
 * looks: a pooler running in transaction mode hands the same physical
 * connection to a different request the instant this one commits, so a
 * session-level setting would leak one rider's identity into another rider's
 * queries. Transaction-local scoping makes that impossible.
 */
export const assumeRider = async (
  client: pg.PoolClient,
  riderId: string | null,
): Promise<void> => {
  await client.query("SELECT set_config('app.rider_id', $1, true)", [
    riderId ?? "",
  ]);
};

/**
 * Runs `fn` in one transaction, as `riderId`.
 *
 * Every authenticated request goes through here, so the identity and the work
 * can never end up on different connections.
 */
export const withRiderTransaction = async <T>(
  pool: pg.Pool,
  riderId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assumeRider(client, riderId);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // The original error is the useful one; a rollback failure on an
      // already-broken connection would only mask it.
    });
    throw error;
  } finally {
    client.release();
  }
};
