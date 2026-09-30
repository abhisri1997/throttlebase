/**
 * Consent in the app (launch readiness E6, docs/launch-readiness/plans/consent.md).
 *
 * The server owns the notices and the ledger; the app shows each notice
 * exactly as sent, asks at the moment a feature starts, and lets the rider
 * change any answer in Settings → Privacy. Riders never asked keep today's
 * features until they are asked (decision "option B"), which here means:
 * asked before their next ride.
 */

export const CONSENT_PURPOSES = [
  "ride_recording",
  "live_location_sharing",
  "motion_activity",
  "public_profile",
  "marketing_notifications",
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export type ConsentStatus = "granted" | "withdrawn" | "reconsent_required" | "not_asked";

export type ConsentSource = "onboarding" | "contextual" | "settings";

export interface ConsentNotice {
  purpose: ConsentPurpose;
  version: string;
  title: string;
  body: string;
}

export interface ConsentSummary {
  purpose: ConsentPurpose;
  status: ConsentStatus;
  answeredVersion: string | null;
  updatedAt: string | null;
}

export interface ConsentOverview {
  notices: ConsentNotice[];
  consents: ConsentSummary[];
  declarations: { age_18_plus: boolean | null };
}

/** What a ride uses, in the order the rider is asked about it. */
export const RIDE_PURPOSES: readonly ConsentPurpose[] = [
  "live_location_sharing",
  "ride_recording",
  "motion_activity",
];

export const statusOf = (overview: ConsentOverview, purpose: ConsentPurpose): ConsentStatus =>
  overview.consents.find((row) => row.purpose === purpose)?.status ?? "not_asked";

export const noticeFor = (overview: ConsentOverview, purpose: ConsentPurpose): ConsentNotice | undefined =>
  overview.notices.find((notice) => notice.purpose === purpose);

/**
 * The ride purposes to ask about before tracking starts: never asked, or
 * agreed to a notice that has since changed. A rider who said no is not
 * asked again on every ride; they change it in Settings.
 */
export const ridePurposesToAsk = (overview: ConsentOverview): ConsentPurpose[] =>
  RIDE_PURPOSES.filter((purpose) => {
    const status = statusOf(overview, purpose);
    return status === "not_asked" || status === "reconsent_required";
  });

/** Mirrors the server's gate (ALLOWED_WHEN_NOT_ASKED): only marketing is opt-in for riders never asked. */
export const permits = (overview: ConsentOverview, purpose: ConsentPurpose): boolean => {
  switch (statusOf(overview, purpose)) {
    case "granted":
      return true;
    case "not_asked":
      return purpose !== "marketing_notifications";
    case "withdrawn":
    case "reconsent_required":
      return false;
  }
};

export interface RideTracking {
  /** Follow the rider's position at all: to share it, record it, or both. */
  track: boolean;
  /** Share the rider's position with the others on the ride. */
  share: boolean;
  /** Read the motion sensors during the ride. */
  motion: boolean;
}

/**
 * Mirrors the server's split (docs/ride-now-ux.md §7.3): recording and sharing
 * are separate, and a position is refused only when both are off.
 */
export const rideTracking = (overview: ConsentOverview): RideTracking => {
  const share = permits(overview, "live_location_sharing");
  const track = share || permits(overview, "ride_recording");
  return { track, share, motion: track && permits(overview, "motion_activity") };
};

export type AgeGate =
  /** Still finding out. */
  | "checking"
  /** Never answered: ask before anything else. */
  | "ask"
  /** Said they are under 18: the app is closed to them. */
  | "under_18"
  | "ok";

/**
 * Where the 18+ question stands. When the answer cannot be fetched (no
 * signal), the rider is let in and asked on a later launch rather than
 * locked out of an app they may be using mid-ride.
 */
export const ageGate = (overview: ConsentOverview | undefined, failed: boolean): AgeGate => {
  if (!overview) return failed ? "ok" : "checking";
  const age = overview.declarations.age_18_plus;
  if (age === null) return "ask";
  return age ? "ok" : "under_18";
};

/** One line under each switch in Settings → Privacy. */
export const statusLine = (status: ConsentStatus): string => {
  switch (status) {
    case "granted":
      return "On";
    case "withdrawn":
      return "Off";
    case "reconsent_required":
      return "Off until you read the updated notice";
    case "not_asked":
      return "Not asked yet";
  }
};
