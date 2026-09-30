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
