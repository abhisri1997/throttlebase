import { query } from '../config/db.js';
import type {
  UpdateSettingsInput, UpdatePrivacyInput, UpdateNotificationPrefInput,
} from '../schemas/notifications.schemas.js';

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const getNotifications = async (riderId: string, unreadOnly = false) => {
  const filter = unreadOnly ? 'AND is_read = false' : '';
  const result = await query(
    `SELECT * FROM notifications WHERE rider_id = $1 ${filter}
     ORDER BY created_at DESC LIMIT 50`,
    [riderId]
  );
  return result.rows;
};

export const markAsRead = async (notificationId: string, riderId: string) => {
  const result = await query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND rider_id = $2 RETURNING id`,
    [notificationId, riderId]
  );
  return result.rows.length > 0;
};

export const markAllAsRead = async (riderId: string) => {
  const result = await query(
    `UPDATE notifications SET is_read = true WHERE rider_id = $1 AND is_read = false`,
    [riderId]
  );
  return result.rowCount ?? 0;
};

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

export const getNotificationPrefs = async (riderId: string) => {
  const result = await query(
    `SELECT * FROM notification_preferences WHERE rider_id = $1 ORDER BY notification_type`,
    [riderId]
  );
  return result.rows;
};

export const upsertNotificationPref = async (riderId: string, data: UpdateNotificationPrefInput) => {
  const result = await query(
    `INSERT INTO notification_preferences (rider_id, notification_type, push_enabled, in_app_enabled, email_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rider_id, notification_type) DO UPDATE
     SET push_enabled = COALESCE($3, notification_preferences.push_enabled),
         in_app_enabled = COALESCE($4, notification_preferences.in_app_enabled),
         email_enabled = COALESCE($5, notification_preferences.email_enabled)
     RETURNING *`,
    [riderId, data.notification_type, data.push_enabled ?? true, data.in_app_enabled ?? true, data.email_enabled ?? false]
  );
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDER SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const getSettings = async (riderId: string) => {
  const result = await query(`SELECT * FROM rider_settings WHERE rider_id = $1`, [riderId]);
  if (result.rows.length === 0) {
    // Auto-create defaults on first access
    const insert = await query(
      `INSERT INTO rider_settings (rider_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *`,
      [riderId]
    );
    return insert.rows[0] || (await query(`SELECT * FROM rider_settings WHERE rider_id = $1`, [riderId])).rows[0];
  }
  return result.rows[0];
};

export const updateSettings = async (riderId: string, data: UpdateSettingsInput) => {
  const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
  if (keys.length === 0) return getSettings(riderId);

  // Ensure row exists
  await query(`INSERT INTO rider_settings (rider_id) VALUES ($1) ON CONFLICT DO NOTHING`, [riderId]);

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => (data as any)[k]);

  const result = await query(
    `UPDATE rider_settings SET ${setClauses.join(', ')} WHERE rider_id = $${keys.length + 1} RETURNING *`,
    [...values, riderId]
  );
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDER PRIVACY SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const getPrivacy = async (riderId: string) => {
  const result = await query(`SELECT * FROM rider_privacy_settings WHERE rider_id = $1`, [riderId]);
  if (result.rows.length === 0) {
    const insert = await query(
      `INSERT INTO rider_privacy_settings (rider_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *`,
      [riderId]
    );
    return insert.rows[0] || (await query(`SELECT * FROM rider_privacy_settings WHERE rider_id = $1`, [riderId])).rows[0];
  }
  return result.rows[0];
};

export const updatePrivacy = async (riderId: string, data: UpdatePrivacyInput) => {
  const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
  if (keys.length === 0) return getPrivacy(riderId);

  await query(`INSERT INTO rider_privacy_settings (rider_id) VALUES ($1) ON CONFLICT DO NOTHING`, [riderId]);

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => (data as any)[k]);

  const result = await query(
    `UPDATE rider_privacy_settings SET ${setClauses.join(', ')} WHERE rider_id = $${keys.length + 1} RETURNING *`,
    [...values, riderId]
  );
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKED RIDERS
// ═══════════════════════════════════════════════════════════════════════════════

export const blockRider = async (blockerId: string, blockedId: string) => {
  if (blockerId === blockedId) throw new Error('Cannot block yourself');
  const result = await query(
    `INSERT INTO blocked_riders (blocker_id, blocked_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING blocker_id`,
    [blockerId, blockedId]
  );
  return result.rows.length > 0;
};

export const unblockRider = async (blockerId: string, blockedId: string) => {
  const result = await query(
    `DELETE FROM blocked_riders WHERE blocker_id = $1 AND blocked_id = $2 RETURNING blocker_id`,
    [blockerId, blockedId]
  );
  return result.rows.length > 0;
};

export const getBlockedRiders = async (blockerId: string) => {
  const result = await query(
    `SELECT r.id, r.display_name FROM blocked_riders br
     JOIN riders r ON br.blocked_id = r.id
     WHERE br.blocker_id = $1
     ORDER BY br.created_at DESC`,
    [blockerId]
  );
  return result.rows;
};
