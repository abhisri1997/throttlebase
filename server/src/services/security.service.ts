import { query } from "../config/db.js";

/**
 * Account-security reads for the settings screen.
 *
 * Password and TOTP handling used to live here and is gone: there are no
 * passwords, and two-factor is meaningless when every sign-in already proves
 * control of a provider account or an inbox.
 *
 * Session creation and revocation now belong to the SessionRepository, which
 * understands refresh-token families. What remains is the read side plus
 * per-session revocation from the UI.
 */

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

/**
 * Active sessions, one row per live refresh-token family.
 *
 * Rotation means a family accumulates rows — every refresh adds one — so the
 * newest row of each family stands for "this device", and showing every row
 * would list one entry per refresh instead of one per sign-in.
 */
export const getActiveSessions = async (riderId: string) => {
  const result = await query(
    `SELECT DISTINCT ON (family_id)
            id, family_id, user_agent, ip_address::text AS ip_address,
            created_at, last_used_at, expires_at
     FROM sessions
     WHERE rider_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
     ORDER BY family_id, created_at DESC`,
    [riderId],
  );
  return result.rows;
};

/** Revokes one signed-in device: the whole family, not just the newest token. */
export const revokeSession = async (
  sessionId: string,
  riderId: string,
): Promise<boolean> => {
  const result = await query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE family_id = (
             SELECT family_id FROM sessions WHERE id = $1 AND rider_id = $2
           )
       AND rider_id = $2
       AND revoked_at IS NULL
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
