/**
 * The consent purposes and the notice shown for each (launch readiness E6,
 * docs/launch-readiness/plans/consent.md).
 *
 * DPDP consent is per purpose and follows an itemised notice (DPDP Act s.6,
 * DPDP Rules, Rule 3): what is collected, why, and how to withdraw or
 * complain. Each purpose has its own notice here, and the server sends the
 * text to the app, so what a rider is shown is exactly what is recorded.
 *
 * Changing a notice's text means publishing a new version: every rider who
 * agreed to the old one is asked again before the feature works for them.
 *
 * ⚖️ Draft wording. Counsel confirms the purposes, the texts, and which
 * features can rest on a "legitimate use" (s.7) instead of consent.
 */

export const CONSENT_PURPOSES = [
  "ride_recording",
  "live_location_sharing",
  "motion_activity",
  "public_profile",
  "marketing_notifications",
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_SOURCES = ["onboarding", "contextual", "settings", "consent_manager", "system"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const NOTICE_LOCALE = "en-IN";

export interface ConsentNotice {
  purpose: ConsentPurpose;
  /** Bumped whenever the text changes. */
  version: string;
  title: string;
  body: string;
}

const HOW_TO_WITHDRAW =
  "You can turn this off at any time in Settings → Privacy, and it stops at once. " +
  "Turning it off does not affect anything else in your account. " +
  "If you have a concern about how we handle your data, contact our Grievance Officer from Settings. " +
  "You can also complain to the Data Protection Board of India.";

const notice = (purpose: ConsentPurpose, title: string, what: string): ConsentNotice => ({
  purpose,
  version: "2026-10-01",
  title,
  body: `${what}\n\n${HOW_TO_WITHDRAW}`,
});

export const CURRENT_NOTICES: Readonly<Record<ConsentPurpose, ConsentNotice>> = {
  ride_recording: notice(
    "ride_recording",
    "Record my rides",
    "While you record a ride, we save your phone's GPS positions, speed and time along the route. " +
      "We use them to show your ride history, distance and stats, and to let you save a ride as a route. " +
      "Only you can see a ride's exact track unless you choose to share it. " +
      "Without this, rides still work, but nothing is saved after they end.",
  ),
  live_location_sharing: notice(
    "live_location_sharing",
    "Share my live location on rides",
    "While a ride you have joined is under way, we share your position with the other riders on that ride, " +
      "so the group can see where everyone is, regroup, and find you if you use Alert my group. " +
      "Sharing starts when you start the ride and stops when you finish or leave it. " +
      "Riders who are not on the ride never see it.",
  ),
  motion_activity: notice(
    "motion_activity",
    "Use motion sensors",
    "We read your phone's motion sensors during a ride to tell whether you are riding or stopped. " +
      "We use this to detect stops and make your ride stats more accurate. " +
      "Without it, stops are worked out from GPS alone.",
  ),
  public_profile: notice(
    "public_profile",
    "Make my profile public",
    "Your name, username, profile photo, bike and ride summaries are shown to anyone using ThrottleBase, " +
      "not only your followers, and you can appear on leaderboards. " +
      "Your email, phone number and home location are never shown. " +
      "Without this, only your followers see your profile.",
  ),
  marketing_notifications: notice(
    "marketing_notifications",
    "News and offers",
    "We send you news about ThrottleBase features, events and offers by notification or email. " +
      "Messages about your account, rides and safety are sent whatever you choose here.",
  ),
};

/** Purposes as the API lists them, in a stable order. */
export const currentNotices = (): ConsentNotice[] => CONSENT_PURPOSES.map((purpose) => CURRENT_NOTICES[purpose]);

export const isConsentPurpose = (value: string): value is ConsentPurpose =>
  (CONSENT_PURPOSES as readonly string[]).includes(value);
