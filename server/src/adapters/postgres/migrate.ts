import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Migration runner.
 *
 * Applies numbered .sql files in order, once each, inside a transaction, and
 * records what ran in `schema_migrations`.
 *
 * Connects with MIGRATION_DATABASE_URL — a privileged role — rather than the
 * least-privilege role the API uses, because migrations create roles, grants
 * and policies that the app role deliberately cannot.
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "db",
  "migrations",
);

/**
 * Everything up to and including this file predates the runner and is already
 * applied to the live database. They are recorded as applied on first run
 * rather than executed. (Two of them share the number 004, which is exactly
 * the ambiguity the ledger exists to remove going forward.)
 */
const BASELINE_THROUGH = "021_stop_suggestions.sql";

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    checksum    text NOT NULL
  );
`;

const checksumOf = async (sql: string): Promise<string> => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(sql).digest("hex");
};

const listMigrationFiles = async (): Promise<string[]> => {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith(".sql")).sort();
};

export interface MigrationResult {
  applied: string[];
  baselined: string[];
  skipped: string[];
}

export const runMigrations = async (
  pool: pg.Pool,
  options: { dryRun?: boolean } = {},
): Promise<MigrationResult> => {
  const result: MigrationResult = { applied: [], baselined: [], skipped: [] };

  await pool.query(LEDGER_DDL);

  const recorded = await pool.query<{ filename: string; checksum: string }>(
    "SELECT filename, checksum FROM schema_migrations",
  );
  const alreadyRun = new Map(
    recorded.rows.map((row) => [row.filename, row.checksum]),
  );

  for (const filename of await listMigrationFiles()) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
    const checksum = await checksumOf(sql);
    const previous = alreadyRun.get(filename);

    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${filename} changed after it was applied. Migrations are immutable once run — add a new file instead.`,
        );
      }
      result.skipped.push(filename);
      continue;
    }

    const isBaseline = filename <= BASELINE_THROUGH;

    if (options.dryRun) {
      (isBaseline ? result.baselined : result.applied).push(filename);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (!isBaseline) {
        await client.query(sql);
      }

      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
        [filename, checksum],
      );
      await client.query("COMMIT");
      (isBaseline ? result.baselined : result.applied).push(filename);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(
        `Migration ${filename} failed and was rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  return result;
};

const main = async (): Promise<void> => {
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Set MIGRATION_DATABASE_URL (preferred) or DATABASE_URL before running migrations.",
    );
  }

  const dryRun = process.argv.includes("--dry-run");
  const pool = new pg.Pool({
    connectionString,
    ...(connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1")
      ? {}
      : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const result = await runMigrations(pool, { dryRun });

    if (result.baselined.length > 0) {
      console.log(
        `📌 recorded as already applied (${result.baselined.length}): ${result.baselined.join(", ")}`,
      );
    }
    if (result.applied.length > 0) {
      console.log(
        `✅ ${dryRun ? "would apply" : "applied"} (${result.applied.length}): ${result.applied.join(", ")}`,
      );
    } else {
      console.log("✅ nothing to apply — database is up to date");
    }
    console.log(`⏭️  already applied: ${result.skipped.length}`);
  } finally {
    await pool.end();
  }
};

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(
      "❌ migration failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
