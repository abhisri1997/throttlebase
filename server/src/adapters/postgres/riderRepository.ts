import type pg from "pg";
import type { IdentityProvider } from "../../ports/IdentityVerifier.js";
import type {
  ConsentInput,
  CreateRiderInput,
  LinkIdentityInput,
  LoginActivityInput,
  OnboardingInput,
  RiderRecord,
  RiderRepository,
  RiderTransaction,
} from "../../ports/RiderRepository.js";
import { assumeRider, withRiderTransaction } from "./requestContext.js";

interface RiderRow {
  id: string;
  email: string | null;
  display_name: string;
  username: string | null;
  profile_picture_url: string | null;
  created_at: Date;
}

const toRecord = (row: RiderRow): RiderRecord => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  username: row.username,
  avatarUrl: row.profile_picture_url,
  createdAt: row.created_at,
});

const RIDER_COLUMNS =
  "id, email, display_name, username, profile_picture_url, created_at";

/**
 * Transaction-scoped rider operations.
 *
 * Note where `assumeRider` is called: as soon as the transaction learns which
 * rider it is acting for. Sign-up inserts rider_settings and rider_consents,
 * whose row policies compare against app.current_rider_id() — with no context
 * established those inserts would be rejected by the database. Setting it the
 * moment the rider id exists keeps the policies strict without core needing
 * to know that row-level security is involved at all.
 */
const buildTransaction = (client: pg.PoolClient): RiderTransaction => ({
  findRiderIdByIdentity: async (
    provider: IdentityProvider,
    subject: string,
  ): Promise<string | null> => {
    // Through a SECURITY DEFINER function (migration 031): this lookup is
    // what establishes app.rider_id, so it necessarily runs before there is
    // one, and the row policy would otherwise filter it to nothing.
    const result = await client.query<{ rider_id: string | null }>(
      "SELECT app.rider_id_by_identity($1, $2) AS rider_id",
      [provider, subject],
    );

    const riderId = result.rows[0]?.rider_id ?? null;
    if (riderId) {
      await assumeRider(client, riderId);
    }
    return riderId;
  },

  findRiderByEmail: async (email: string): Promise<RiderRecord | null> => {
    const result = await client.query<RiderRow>(
      `SELECT ${RIDER_COLUMNS} FROM riders
        WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    await assumeRider(client, row.id);
    return toRecord(row);
  },

  createRider: async (input: CreateRiderInput): Promise<RiderRecord> => {
    const result = await client.query<RiderRow>(
      `INSERT INTO riders (email, display_name, profile_picture_url)
       VALUES ($1, $2, $3)
       RETURNING ${RIDER_COLUMNS}`,
      [input.email, input.displayName, input.avatarUrl],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Rider insert returned no row");
    }

    // From here on this transaction acts as the rider it just created.
    await assumeRider(client, row.id);
    return toRecord(row);
  },

  linkIdentity: async (
    input: LinkIdentityInput,
  ): Promise<{ inserted: boolean }> => {
    // ON CONFLICT DO NOTHING turns a first-sign-in race into a value rather
    // than an exception: the primary key on (provider, subject) decides the
    // winner, and rowCount tells the caller which side it is on.
    const result = await client.query(
      `INSERT INTO rider_identities (provider, subject, rider_id, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, subject) DO NOTHING`,
      [input.provider, input.subject, input.riderId, input.email],
    );

    return { inserted: (result.rowCount ?? 0) > 0 };
  },

  createDefaultSettings: async (riderId: string): Promise<void> => {
    await client.query(
      "INSERT INTO rider_settings (rider_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [riderId],
    );
    await client.query(
      "INSERT INTO rider_privacy_settings (rider_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [riderId],
    );
  },

  recordConsent: async (input: ConsentInput): Promise<void> => {
    await client.query(
      `INSERT INTO rider_consents (rider_id, terms_version, privacy_version, ip)
       VALUES ($1, $2, $3, $4::inet)`,
      [input.riderId, input.termsVersion, input.privacyVersion, input.ip],
    );
  },

  recordLoginActivity: async (input: LoginActivityInput): Promise<void> => {
    await client.query(
      `INSERT INTO login_activity (rider_id, ip_address, device_fingerprint)
       VALUES ($1, $2::inet, $3)`,
      [input.riderId, input.ipAddress, input.deviceFingerprint],
    );
  },

  getRoles: async (riderId: string): Promise<string[]> => {
    const result = await client.query<{ role: string }>(
      "SELECT role FROM rider_roles WHERE rider_id = $1",
      [riderId],
    );
    return result.rows.map((row) => row.role);
  },

  findRiderById: async (riderId: string): Promise<RiderRecord | null> => {
    const result = await client.query<RiderRow>(
      `SELECT ${RIDER_COLUMNS} FROM riders WHERE id = $1 AND deleted_at IS NULL`,
      [riderId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  },
});

export const createRiderRepository = (pool: pg.Pool): RiderRepository => ({
  withTransaction: <T>(fn: (tx: RiderTransaction) => Promise<T>): Promise<T> =>
    // Starts with no rider context; the transaction adopts one as soon as it
    // identifies the rider.
    withRiderTransaction(pool, null, (client) => fn(buildTransaction(client))),

  findByUsername: async (username: string): Promise<RiderRecord | null> => {
    const result = await pool.query<RiderRow>(
      `SELECT ${RIDER_COLUMNS} FROM riders
        WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
      [username],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  },

  completeOnboarding: async (input: OnboardingInput): Promise<RiderRecord> =>
    await withRiderTransaction(pool, input.riderId, async (client) => {
      const result = await client.query<RiderRow>(
        `UPDATE riders
            SET username = $2,
                display_name = $3,
                experience_level = $4,
                location_city = $5,
                updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING ${RIDER_COLUMNS}`,
        [
          input.riderId,
          input.username,
          input.displayName,
          input.experienceLevel,
          input.locationCity,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Rider not found while completing onboarding");
      }

      if (input.firstVehicle) {
        await client.query(
          `INSERT INTO vehicles (rider_id, make, model, year, engine_capacity_cc)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            input.riderId,
            input.firstVehicle.make,
            input.firstVehicle.model,
            input.firstVehicle.year,
            input.firstVehicle.engineCapacityCc,
          ],
        );
      }

      return toRecord(row);
    }),

  softDeleteAndUnlink: async (riderId: string, at: Date): Promise<boolean> =>
    await withRiderTransaction(pool, riderId, async (client) => {
      // Identities go first: while any remain, the provider could sign this
      // account straight back in.
      await client.query("DELETE FROM rider_identities WHERE rider_id = $1", [
        riderId,
      ]);

      // The row itself is kept, anonymised. Rides, participation and safety
      // records reference it, and a hard delete would corrupt other riders'
      // history. What is cleared is everything personal.
      const result = await client.query(
        `UPDATE riders
            SET deleted_at = $2,
                email = NULL,
                display_name = 'Deleted rider',
                username = NULL,
                bio = NULL,
                profile_picture_url = NULL,
                phone_number = NULL,
                location_city = NULL,
                location_region = NULL,
                location_coords = NULL,
                weight_kg = NULL,
                updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL`,
        [riderId, at],
      );

      return (result.rowCount ?? 0) > 0;
    }),
});
