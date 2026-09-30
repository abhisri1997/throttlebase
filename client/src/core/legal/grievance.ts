/**
 * DRAFT — NOT LEGAL ADVICE. The Grievance Officer page (IT Rules 2021,
 * Rule 3(2); DPDP Act 2023, s.8(10)), shown at /grievance and on
 * throttlebase.in so anyone can find it without an account. The deadlines
 * match server/src/core/moderation/grievance.ts. ⚖️ A lawyer confirms the
 * officer's details and the deadlines before `status` becomes "final".
 */
import { list, paragraph, type LegalDocument } from "./legalDocument";

export const GRIEVANCE: LegalDocument = {
  title: "Grievance Officer",
  version: "2026-09-30",
  status: "draft",
  summary: [
    "Report a post, comment, rider, ride or route from the app: every report reaches the Grievance Officer.",
    "We acknowledge every complaint at once, with a reference, and resolve it within 7 days (72 hours for sexual content).",
    "You can follow your reports in the app under Settings → Your reports.",
    "Anything else, including appeals, goes to the Grievance Officer by email.",
  ],
  sections: [
    {
      heading: "Grievance Officer",
      blocks: [
        paragraph("Our Grievance Officer handles complaints about content, other riders, your account and your personal data:"),
        list("[GRIEVANCE OFFICER NAME]", "Email: [GRIEVANCE OFFICER EMAIL]", "Address: [CONTACT ADDRESS]"),
      ],
    },
    {
      heading: "How to complain",
      blocks: [
        list(
          "In the app: tap Report on a post, comment, rider, ride or route, choose a reason, and add anything we should know. This is the fastest way, and you get a reference at once.",
          "By email: write to the Grievance Officer with your name, how to reach you, what you are complaining about (a link or a description), and why.",
          "You don't have to be a ThrottleBase rider to complain by email.",
        ),
      ],
    },
    {
      heading: "What happens next, and when",
      blocks: [
        list(
          "We acknowledge your complaint at once, with a reference such as R-1A2B3C4D. By email, within 24 hours.",
          "We resolve it within 7 days, or within 72 hours if it is about sexual content.",
          "We tell you the outcome: that we took action, or that it didn't break our Community Guidelines. We don't tell you what we did to another rider's account.",
          "The rider you reported isn't told who reported them.",
        ),
      ],
    },
    {
      heading: "If we acted against your content or account",
      blocks: [
        paragraph(
          "If we removed something you posted or suspended your account, we tell you why in the app. If you think we got it wrong, email the Grievance Officer with your reference or the date, and we will review the decision.",
        ),
      ],
    },
    {
      heading: "Your personal data",
      blocks: [
        paragraph(
          "For complaints about how we handle your personal data, see our Privacy Policy. If you are not satisfied with our answer, you can complain to the Data Protection Board of India.",
        ),
      ],
    },
  ],
};
