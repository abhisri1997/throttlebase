import pg from "pg";

export interface PoolConfig {
  connectionString: string;
  /**
   * Verify the server's certificate chain. Off only where a managed host
   * presents a chain the runtime image cannot complete; the connection is
   * still encrypted either way.
   */
  rejectUnauthorized: boolean;
  max?: number;
}

/**
 * A plain Postgres pool over a standard connection string.
 *
 * Nothing here is vendor-aware: the same code reaches a container, a managed
 * host or a self-run server, and moving between them is a change of
 * DATABASE_URL.
 */
export const createPool = (config: PoolConfig): pg.Pool => {
  const isLocal =
    config.connectionString.includes("localhost") ||
    config.connectionString.includes("127.0.0.1");

  return new pg.Pool({
    connectionString: stripSslMode(config.connectionString),
    // A local container has no TLS at all; anything else does.
    ...(isLocal
      ? {}
      : { ssl: { rejectUnauthorized: config.rejectUnauthorized } }),
    max: config.max ?? 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
};

/**
 * Removes `sslmode` from the connection string.
 *
 * pg-connection-string treats an embedded sslmode as a complete TLS policy
 * and builds its own config from it, which then overrides the explicit `ssl`
 * option above. Stripping it leaves exactly one place where TLS behaviour is
 * decided.
 */
export const stripSslMode = (connectionString: string): string =>
  connectionString
    .replace(/([?&])sslmode=[^&]*&?/gi, (_match, lead: string) =>
      lead === "?" ? "?" : "&",
    )
    .replace(/[?&]$/, "");
