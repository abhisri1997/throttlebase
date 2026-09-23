import dotenv from "dotenv";
import { createPool } from "../adapters/postgres/pool.js";

dotenv.config();

/**
 * The application's Postgres pool.
 *
 * A standard connection string is the only thing that ties this app to a
 * database host. Moving between a container, a managed service or a
 * self-hosted server is a change of DATABASE_URL and nothing else.
 *
 * The API connects as a least-privilege role that owns no tables and has no
 * BYPASSRLS, so the row policies genuinely apply to it.
 */
/**
 * Discrete DB_* variables remain supported for local development, where a
 * plain host/port/user is often more convenient than assembling a URL.
 *
 * They are assembled into a connection string rather than handled separately,
 * so there is exactly one code path into the pool — and so importing this
 * module never fails. A missing configuration surfaces on the first query,
 * with Postgres's own error, instead of breaking every test that happens to
 * import something that imports this.
 */
const buildConnectionString = (): string => {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) {
    return direct;
  }

  const host = process.env.DB_HOST || process.env.PGHOST || "localhost";
  const port = process.env.DB_PORT || process.env.PGPORT || "5432";
  const user = process.env.DB_USER || process.env.PGUSER || "postgres";
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || "";
  const database = process.env.DB_NAME || process.env.PGDATABASE || "throttle_base";

  const credentials = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);

  return `postgresql://${credentials}@${host}:${port}/${database}`;
};

const connectionString = buildConnectionString();

const pool = createPool({
  connectionString,
  // Certificate-chain verification is on unless explicitly disabled. Some
  // managed hosts present a chain that a slim container image cannot
  // complete; the connection stays encrypted either way.
  rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
});

export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);

export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await query("SELECT NOW() as now");
    console.log("✅ Database connected successfully at:", result.rows[0].now);
    return true;
  } catch (error) {
    console.error(
      "❌ Database connection failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
};

export default pool;
