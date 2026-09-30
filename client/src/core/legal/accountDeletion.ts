/**
 * DRAFT — NOT LEGAL ADVICE. The text of throttlebase.in/delete-account, the
 * page Google Play requires: how to delete an account, what is deleted, and
 * what is kept and for how long. The same page is Settings → Account →
 * Delete account in the app. What is kept is worded once, in
 * deletionRetention.ts, and shared with the Privacy Policy.
 */
import {
  LEGALLY_PRESERVED,
  ON_ACCOUNT_DELETION,
  PUBLIC_ROUTES_KEPT,
  SEALED_REGISTRATION_RECORD,
  SECURITY_RECORDS_KEPT,
  SHARED_RIDES_KEPT,
} from "./deletionRetention";
import { list, paragraph, type LegalDocument } from "./legalDocument";

export const ACCOUNT_DELETION: LegalDocument = {
  title: "Delete your ThrottleBase account",
  version: "2026-09-30",
  status: "draft",
  summary: [
    "You can delete your ThrottleBase account here, in the app or on the web. You don't need the app installed.",
    "We email a code to the address on your account. Entering it deletes the account, and this can't be undone.",
    "You're signed out everywhere and your profile and content are hidden straight away. Your data is deleted 30 days later, apart from the few things listed below.",
  ],
  sections: [
    {
      heading: "How to delete your account",
      blocks: [
        list(
          "In the app: Settings → Account → Delete account. On the web: throttlebase.in/delete-account, with the email address you signed up with.",
          "Ask for a code. We email a 6-digit code to that address; it works for 10 minutes and only once.",
          "Enter the code and confirm. Your account is deleted at once.",
          "Can't get email at that address? Email [CONTACT EMAIL] and we'll help.",
        ),
      ],
    },
    {
      heading: "What is deleted",
      blocks: [
        paragraph(ON_ACCOUNT_DELETION),
        paragraph(
          "That includes your profile, your posts, comments, likes and follows, your own ride tracks, stats and ride participation, and your private routes and routes shared with specific riders.",
        ),
      ],
    },
    {
      heading: "What is kept, and for how long",
      blocks: [
        list(
          SEALED_REGISTRATION_RECORD,
          PUBLIC_ROUTES_KEPT,
          SHARED_RIDES_KEPT,
          SECURITY_RECORDS_KEPT,
          LEGALLY_PRESERVED,
        ),
      ],
    },
    {
      heading: "Rides and groups you lead",
      blocks: [
        paragraph(
          "An upcoming ride you captain passes to a co-captain, or else to another rider on it, and a group you own passes to another admin, or else to another member. Everyone on it is told. If nobody is left, the ride is cancelled, and the group is deleted along with your data.",
        ),
      ],
    },
    {
      heading: "Changed your mind?",
      blocks: [
        paragraph(
          "A deleted account can't be recovered. You can sign up again with the same email address, as a new account.",
        ),
      ],
    },
  ],
};
