/**
 * How long each kind of data is kept before a worker job deletes it (launch
 * readiness E11). Every retention period lives here, so the Privacy Policy,
 * the deletion page and docs/launch-readiness/data-inventory.md §8 can be
 * checked against one file. Changing a value here means changing that text
 * too (client/src/core/legal/deletionRetention.ts).
 */

/** Days between deleting an account and purging its data (account-purge.processor). */
export const ACCOUNT_PURGE_GRACE_DAYS = 30;

/**
 * Days a sealed registration record is kept after the account is cancelled
 * (IT Rules 2021, Rule 3(1)(h)). Stored per record as its purge date, which
 * sealed.purge_expired_registrations() acts on.
 */
export const REGISTRATION_RETENTION_DAYS = 180;

/** Days content a moderator removed is kept, for appeals and legal requests. */
export const REMOVED_CONTENT_RETENTION_DAYS = 180;

/**
 * Days sign-in history (`login_activity`) and the audit trail
 * (`security_events`: moderation actions, consent withdrawals) are kept.
 * One year covers CERT-In's 180 days and the DPDP Rules' one-year log
 * requirement. ⚖️ Confirm with counsel.
 */
export const SECURITY_LOG_RETENTION_DAYS = 365;

/**
 * Days email codes (`email_otps`: address, code digest, requesting IP) are
 * kept. A code is useless after minutes, and successful sign-ins are in
 * `login_activity`; the rows are kept this long only to look into abuse.
 */
export const EMAIL_CODE_RETENTION_DAYS = 30;

/** Days an in-app notification is kept. The app lists only the latest 50. */
export const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Days a ride incident (a group alert, with where it was raised) is kept,
 * like other records kept for complaints and legal requests. After that the
 * ride's timeline no longer shows it.
 */
export const INCIDENT_RETENTION_DAYS = 180;

/** Days a completed or cancelled job is kept. */
export const JOB_RETENTION_DAYS = 7;

/** Days a failed job is kept, longer so failures can be looked into. */
export const FAILED_JOB_RETENTION_DAYS = 30;
