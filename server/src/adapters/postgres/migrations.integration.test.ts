import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Integration test against a disposable Postgres + PostGIS.
 *
 * Two things are proved here that no unit test can:
 *
 *   1. The schema is portable. Every migration applies to a stock Postgres 17
 *      + PostGIS container with no vendor extensions, no vendor auth schema
 *      and no vendor roles. If anything ever creeps in that depends on the
 *      current host, this test stops passing.
 *
 *   2. RLS is real. The API connects as throttlebase_app, which owns nothing
 *      and has no BYPASSRLS, so the policies are the only thing standing
 *      between rider A and rider B's private rows. That is worth checking
 *      against a live planner rather than reasoning about.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database, so the
 * ordinary unit run needs no Docker:
 *
 *   docker run -d --name tb-test -e POSTGRES_PASSWORD=testpw \
 *     -e POSTGRES_DB=tb_test -p 55433:5432 imresamu/postgis:17-3.5
 *   TEST_DATABASE_URL=postgresql://postgres:testpw@127.0.0.1:55433/tb_test \
 *     npm run test:integration
 */

const CONNECTION = process.env.TEST_DATABASE_URL;

const RIDER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const RIDER_B = "bbbbbbbb-0000-0000-0000-000000000002";

/** Runs `fn` in one transaction acting as `riderId`, exactly as the API does. */
const asRider = async <T>(
  pool: pg.Pool,
  riderId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction-local: a pooler in transaction mode may hand this physical
    // connection to a different rider the moment we commit.
    await client.query("SELECT set_config('app.rider_id', $1, true)", [
      riderId ?? "",
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const countRows = async (
  pool: pg.Pool,
  riderId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<number> => {
  const value = await asRider(pool, riderId, async (client) => {
    const result = await client.query<{ count: string }>(sql, params);
    return result.rows[0]?.count ?? "0";
  });
  return Number(value);
};

test(
  "migrations apply to stock Postgres+PostGIS and RLS isolates riders",
  { skip: CONNECTION ? false : "set TEST_DATABASE_URL to run" },
  async (t) => {
    const admin = new pg.Pool({ connectionString: CONNECTION });
    let app: pg.Pool | null = null;

    t.after(async () => {
      if (app) await app.end();
      await admin.end();
    });

    await t.test("every migration applies from scratch", async () => {
      const result = await runMigrations(admin);
      assert.ok(
        result.applied.length + result.skipped.length >= 30,
        "expected the full migration set to be accounted for",
      );
      assert.equal(
        result.baselined.length,
        0,
        "a fresh database baselines nothing",
      );
    });

    await t.test("no vendor-specific schema is required", async () => {
      // The portability claim, made concrete: none of these may exist for the
      // schema to work.
      const vendorSchemas = await admin.query<{ nspname: string }>(
        `SELECT nspname FROM pg_namespace
          WHERE nspname IN ('auth', 'storage', 'realtime', 'vault', 'supabase_functions')`,
      );
      assert.deepEqual(vendorSchemas.rows, []);

      const postgis = await admin.query<{ installed_version: string | null }>(
        "SELECT installed_version FROM pg_available_extensions WHERE name = 'postgis'",
      );
      assert.ok(postgis.rows[0]?.installed_version, "PostGIS must be installed");
    });

    await t.test("the app role has no way to bypass policies", async () => {
      const role = await admin.query<{
        rolbypassrls: boolean;
        rolsuper: boolean;
      }>(
        "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'throttlebase_app'",
      );

      assert.equal(role.rows[0]?.rolbypassrls, false);
      assert.equal(role.rows[0]?.rolsuper, false);

      // Owning a table also bypasses its policies unless FORCE is set.
      const owned = await admin.query<{ count: string }>(
        `SELECT count(*) FROM pg_tables
          WHERE schemaname = 'public' AND tableowner = 'throttlebase_app'`,
      );
      assert.equal(owned.rows[0]?.count, "0", "the app role must own no tables");
    });

    await t.test("no table is RLS-enabled without a policy", async () => {
      // Such a table denies everything to the app role, which fails closed but
      // silently — an empty result set, not an error.
      const orphans = await admin.query<{ relname: string }>(
        `SELECT c.relname
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
            AND NOT EXISTS (
              SELECT 1 FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname)`,
      );
      assert.deepEqual(
        orphans.rows.map((r) => r.relname),
        [],
      );
    });

    await t.test("rider A cannot read rider B's private rows", async () => {
      // Arrange: two riders, each with a session and a settings row, seeded
      // with full privileges so the test does not depend on the policies to
      // set itself up.
      await admin.query(
        `INSERT INTO riders (id, email, display_name, username) VALUES
           ($1, 'a@example.test', 'Rider A', 'ridera'),
           ($2, 'b@example.test', 'Rider B', 'riderb')
         ON CONFLICT (id) DO NOTHING`,
        [RIDER_A, RIDER_B],
      );
      await admin.query(
        `INSERT INTO sessions (rider_id, refresh_token_hash, family_id, expires_at) VALUES
           ($1, 'hash-a', gen_random_uuid(), now() + interval '30 days'),
           ($2, 'hash-b', gen_random_uuid(), now() + interval '30 days')
         ON CONFLICT (refresh_token_hash) DO NOTHING`,
        [RIDER_A, RIDER_B],
      );
      await admin.query(
        `INSERT INTO rider_settings (rider_id) VALUES ($1), ($2)
         ON CONFLICT (rider_id) DO NOTHING`,
        [RIDER_A, RIDER_B],
      );

      await admin.query(
        "ALTER ROLE throttlebase_app WITH LOGIN PASSWORD 'integration-test-pw'",
      );
      const url = new URL(CONNECTION as string);
      url.username = "throttlebase_app";
      url.password = "integration-test-pw";
      app = new pg.Pool({ connectionString: url.toString() });

      // Act & Assert
      assert.equal(
        await countRows(app, RIDER_A, "SELECT count(*) FROM sessions"),
        1,
        "A sees exactly one session — their own — though two exist",
      );
      assert.equal(
        await countRows(
          app,
          RIDER_A,
          "SELECT count(*) FROM sessions WHERE rider_id = $1",
          [RIDER_B],
        ),
        0,
        "A must not see B's sessions",
      );
      assert.equal(
        await countRows(
          app,
          RIDER_A,
          "SELECT count(*) FROM rider_settings WHERE rider_id = $1",
          [RIDER_B],
        ),
        0,
        "A must not see B's settings",
      );
      assert.equal(
        await countRows(
          app,
          RIDER_B,
          "SELECT count(*) FROM sessions WHERE rider_id = $1",
          [RIDER_A],
        ),
        0,
        "and the isolation is symmetric",
      );
    });

    await t.test("an unidentified connection sees no private rows", async () => {
      assert.ok(app);
      assert.equal(
        await countRows(app, null, "SELECT count(*) FROM sessions"),
        0,
        "no app.rider_id means no rows, rather than all rows",
      );
    });

    await t.test("rider A cannot modify rider B's profile", async () => {
      assert.ok(app);

      const updated = await countRows(
        app,
        RIDER_A,
        `WITH u AS (
           UPDATE riders SET display_name = 'tampered' WHERE id = $1 RETURNING 1
         ) SELECT count(*) FROM u`,
        [RIDER_B],
      );
      assert.equal(updated, 0);

      const after = await admin.query<{ display_name: string }>(
        "SELECT display_name FROM riders WHERE id = $1",
        [RIDER_B],
      );
      assert.equal(after.rows[0]?.display_name, "Rider B");
    });

    await t.test(
      "the app role cannot corrupt the PostGIS reference table",
      async () => {
        assert.ok(app);
        await assert.rejects(
          () =>
            (app as pg.Pool).query(
              "DELETE FROM spatial_ref_sys WHERE srid = 4326",
            ),
          /permission denied/i,
        );
      },
    );
  },
);
