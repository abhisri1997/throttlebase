/**
 * Whether a rider's consent to a purpose counts right now.
 *
 * Consent is given to one version of one notice. It counts only while that
 * version is still the current one: after the notice changes, the feature
 * stays off until the rider agrees to the new text (plans/consent.md,
 * "Notice version bump").
 */
import { CONSENT_PURPOSES, CURRENT_NOTICES, type ConsentPurpose } from "./notices.js";

/** A rider's latest answer for one purpose, as stored. */
export interface StoredConsent {
  purpose: ConsentPurpose;
  granted: boolean;
  noticeVersion: string;
  updatedAt: Date;
}

export type ConsentStatus =
  /** Agreed to the current notice. */
  | "granted"
  /** Said no, or turned it off. */
  | "withdrawn"
  /** Agreed to an older notice; must see and accept the new one. */
  | "reconsent_required"
  /** Never asked. */
  | "not_asked";

export const consentStatus = (
  stored: StoredConsent | undefined,
  currentVersion: string = stored ? CURRENT_NOTICES[stored.purpose].version : "",
): ConsentStatus => {
  if (!stored) return "not_asked";
  if (!stored.granted) return "withdrawn";
  return stored.noticeVersion === currentVersion ? "granted" : "reconsent_required";
};

/** True only when the rider agreed to the notice now in force. */
export const hasCurrentConsent = (stored: StoredConsent | undefined): boolean =>
  consentStatus(stored) === "granted";

export interface ConsentSummary {
  purpose: ConsentPurpose;
  status: ConsentStatus;
  /** The version the stored answer was given against, if any. */
  answeredVersion: string | null;
  updatedAt: Date | null;
}

/** One entry per purpose, in the order the app lists them. */
export const summarizeConsents = (stored: readonly StoredConsent[]): ConsentSummary[] => {
  const byPurpose = new Map(stored.map((row) => [row.purpose, row]));
  return CONSENT_PURPOSES.map((purpose) => {
    const row = byPurpose.get(purpose);
    return {
      purpose,
      status: consentStatus(row),
      answeredVersion: row?.noticeVersion ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
};

export type ConsentRefusal = "stale_notice";

/**
 * The app says which notice version the rider saw. An answer to anything but
 * the current one is refused, so a stale build can never record agreement to
 * text the rider was not shown.
 */
export const refuseAnswer = (purpose: ConsentPurpose, shownVersion: string): ConsentRefusal | null =>
  CURRENT_NOTICES[purpose].version === shownVersion ? null : "stale_notice";

/**
 * Whether a purpose may be used when the rider was never asked.
 *
 * Decided 2026-09-30 (option B): riders who signed up before consent was
 * asked for keep today's behaviour until the app asks them on next use. An
 * explicit no, a withdrawal, or a grant of an older notice switches the
 * feature off at once. Marketing was never sent before, so it is opt-in
 * only: nothing to carry over.
 */
export const ALLOWED_WHEN_NOT_ASKED: Readonly<Record<ConsentPurpose, boolean>> = {
  ride_recording: true,
  live_location_sharing: true,
  motion_activity: true,
  public_profile: true,
  marketing_notifications: false,
};

/** The gate a feature checks before using a purpose. */
export const permitsUse = (purpose: ConsentPurpose, stored: StoredConsent | undefined): boolean => {
  switch (consentStatus(stored)) {
    case "granted":
      return true;
    case "not_asked":
      return ALLOWED_WHEN_NOT_ASKED[purpose];
    case "withdrawn":
    case "reconsent_required":
      return false;
  }
};

export type ConsentPermissions = Readonly<Record<ConsentPurpose, boolean>>;

/** Every purpose's gate from the rider's stored answers. */
export const permissionsFrom = (stored: readonly StoredConsent[]): ConsentPermissions => {
  const byPurpose = new Map(stored.map((row) => [row.purpose, row]));
  return Object.fromEntries(
    CONSENT_PURPOSES.map((purpose) => [purpose, permitsUse(purpose, byPurpose.get(purpose))]),
  ) as Record<ConsentPurpose, boolean>;
};

export interface LocationUpdateUse<Activity> {
  /** Refuse the update: the rider is not sharing their live location. */
  refuse: boolean;
  /** Keep the point in the rider's recorded track. */
  record: boolean;
  /** The motion activity to use, or undefined to drop it. */
  activity: Activity | undefined;
}

/**
 * What a live location update may be used for (plans/consent.md,
 * "Enforcement"): shared only with live_location_sharing, recorded only with
 * ride_recording as well, and its motion activity used only with
 * motion_activity.
 */
export const locationUpdateUse = <Activity>(
  permissions: ConsentPermissions,
  activity: Activity | undefined,
): LocationUpdateUse<Activity> => ({
  refuse: !permissions.live_location_sharing,
  record: permissions.live_location_sharing && permissions.ride_recording,
  activity: permissions.live_location_sharing && permissions.motion_activity ? activity : undefined,
});
