import { generate, generateSecret, generateURI, verify } from "otplib";
import bcrypt from "bcrypt";
import { query } from "../config/db.js";

const APP_NAME = "ThrottleBase";
let hasTotpVerifiedAtColumn: boolean | null = null;

const ridersHasTotpVerifiedAt = async (): Promise<boolean> => {
  if (hasTotpVerifiedAtColumn !== null) {
    return hasTotpVerifiedAtColumn;
  }

  const result = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'riders'
       AND column_name = 'totp_verified_at'
     LIMIT 1`,
  );
  hasTotpVerifiedAtColumn = result.rows.length > 0;
  return hasTotpVerifiedAtColumn;
};

// ── TOTP ──────────────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret for a rider and persist it (unverified).
 * Returns the secret and an otpauth:// URI for QR display.
 */
export const setupTotp = async (
  riderId: string,
): Promise<{ secret: string; otpauthUrl: string }> => {
  const secret = generateSecret();

  const riderResult = await query(
    "SELECT email FROM riders WHERE id = $1 AND deleted_at IS NULL",
    [riderId],
  );
  if (riderResult.rows.length === 0) throw new Error("Rider not found");
  const email = riderResult.rows[0].email as string;

  if (await ridersHasTotpVerifiedAt()) {
    await query(
      `UPDATE riders
       SET two_factor_secret = $1,
           two_factor_enabled = false,
           totp_verified_at = NULL
       WHERE id = $2`,
      [secret, riderId],
    );
  } else {
    await query(
      `UPDATE riders
       SET two_factor_secret = $1,
           two_factor_enabled = false
       WHERE id = $2`,
      [secret, riderId],
    );
  }

  const otpauthUrl = generateURI({ secret, label: email, issuer: APP_NAME, strategy: "totp" });
  return { secret, otpauthUrl };
};

/**
 * Verify a 6-digit TOTP token and enable 2FA on success.
 */
export const verifyTotp = async (
  riderId: string,
  token: string,
): Promise<void> => {
  const result = await query(
    "SELECT two_factor_secret FROM riders WHERE id = $1 AND deleted_at IS NULL",
    [riderId],
  );
  if (result.rows.length === 0) throw new Error("Rider not found");

  const secret = result.rows[0].two_factor_secret as string | null;
  if (!secret) throw new Error("2FA setup not initiated. Call /auth/2fa/setup first.");

  const verifyResult = await verify({ token, secret, strategy: "totp" });
  if (!verifyResult.valid) throw new Error("Invalid TOTP token");

  if (await ridersHasTotpVerifiedAt()) {
    await query(
      `UPDATE riders
       SET two_factor_enabled = true, totp_verified_at = now()
       WHERE id = $1`,
      [riderId],
    );
  } else {
    await query(
      `UPDATE riders
       SET two_factor_enabled = true
       WHERE id = $1`,
      [riderId],
    );
  }
};

/**
 * Disable 2FA after validating the rider's password and current TOTP code.
 */
export const disableTotp = async (
  riderId: string,
  password: string,
  token: string,
): Promise<void> => {
  const result = await query(
    `SELECT password_hash, two_factor_secret, two_factor_enabled
     FROM riders WHERE id = $1 AND deleted_at IS NULL`,
    [riderId],
  );
  if (result.rows.length === 0) throw new Error("Rider not found");

  const { password_hash, two_factor_secret, two_factor_enabled } = result.rows[0] as {
    password_hash: string;
    two_factor_secret: string | null;
    two_factor_enabled: boolean;
  };

  if (!two_factor_enabled) throw new Error("2FA is not currently enabled");
  if (!two_factor_secret) throw new Error("2FA secret missing");

  const passwordOk = await bcrypt.compare(password, password_hash);
  if (!passwordOk) throw new Error("Invalid password");

  const tokenResult = await verify({ token, secret: two_factor_secret, strategy: "totp" });
  if (!tokenResult.valid) throw new Error("Invalid TOTP token");

  if (await ridersHasTotpVerifiedAt()) {
    await query(
      `UPDATE riders
       SET two_factor_enabled = false, two_factor_secret = NULL, totp_verified_at = NULL
       WHERE id = $1`,
      [riderId],
    );
  } else {
    await query(
      `UPDATE riders
       SET two_factor_enabled = false, two_factor_secret = NULL
       WHERE id = $1`,
      [riderId],
    );
  }
};

/**
 * Get 2FA status for a rider (does not expose secret).
 */
export const getTotpStatus = async (
  riderId: string,
): Promise<{ enabled: boolean; verified_at: string | null }> => {
  const result = await query(
    `SELECT two_factor_enabled,
            COALESCE((to_jsonb(riders)->>'totp_verified_at')::timestamptz::text, NULL) AS totp_verified_at
     FROM riders WHERE id = $1 AND deleted_at IS NULL`,
    [riderId],
  );
  if (result.rows.length === 0) throw new Error("Rider not found");
  const row = result.rows[0] as { two_factor_enabled: boolean; totp_verified_at: string | null };
  return { enabled: row.two_factor_enabled, verified_at: row.totp_verified_at };
};

// ── Login Activity ─────────────────────────────────────────────────────────────

export const recordLoginActivity = async (input: {
  riderId: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  geoLocation?: string;
}): Promise<void> => {
  await query(
    `INSERT INTO login_activity (rider_id, ip_address, device_fingerprint, geo_location)
     VALUES ($1, $2::inet, $3, $4)`,
    [input.riderId, input.ipAddress ?? null, input.deviceFingerprint ?? null, input.geoLocation ?? null],
  );
};

export const getLoginActivity = async (riderId: string, limit = 20) => {
  const result = await query(
    `SELECT id, device_fingerprint, ip_address::text AS ip_address, geo_location, logged_in_at
     FROM login_activity
     WHERE rider_id = $1
     ORDER BY logged_in_at DESC
     LIMIT $2`,
    [riderId, limit],
  );
  return result.rows;
};

// ── Sessions ──────────────────────────────────────────────────────────────────

export const createSession = async (input: {
  riderId: string;
  sessionToken: string;
  deviceInfo?: string;
  ipAddress?: string;
  expiresInDays?: number;
}): Promise<string> => {
  const expiresInDays = input.expiresInDays ?? 30;
  const tokenHash = await bcrypt.hash(input.sessionToken, 8);

  const result = await query(
    `INSERT INTO sessions (rider_id, refresh_token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4::inet, now() + ($5 || ' days')::interval)
     RETURNING id`,
    [input.riderId, tokenHash, input.deviceInfo ?? null, input.ipAddress ?? null, String(expiresInDays)],
  );
  return result.rows[0].id as string;
};

export const getActiveSessions = async (riderId: string) => {
  const result = await query(
    `SELECT id, device_info, ip_address::text AS ip_address, created_at, expires_at
     FROM sessions
     WHERE rider_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC`,
    [riderId],
  );
  return result.rows;
};

export const revokeSession = async (
  sessionId: string,
  riderId: string,
): Promise<boolean> => {
  const result = await query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE id = $1 AND rider_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [sessionId, riderId],
  );
  return result.rows.length > 0;
};

export const revokeAllSessions = async (riderId: string): Promise<number> => {
  const result = await query(
    `UPDATE sessions SET revoked_at = now()
     WHERE rider_id = $1 AND revoked_at IS NULL`,
    [riderId],
  );
  return result.rowCount ?? 0;
};
