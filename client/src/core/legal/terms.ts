/**
 * DRAFT — NOT LEGAL ADVICE. Structure from docs/launch-readiness/compliance-report.md
 * §2.2; the liability, indemnity and ride-organiser clauses in particular need
 * a lawyer before `status` becomes "final".
 */
import { list, paragraph, type LegalDocument } from "./legalDocument";

export const TERMS: LegalDocument = {
  title: "Terms of Use",
  version: "2026-09-29",
  status: "draft",
  summary: [
    "You must be 18 or over to use ThrottleBase.",
    "Never use the app while riding. Set it up before you ride and follow the traffic laws.",
    "ThrottleBase is not an emergency service. In an emergency, call 112.",
    "You ride at your own risk. We don't organise rides or check roads, and routes shared by riders may be wrong or unsafe.",
    "You own what you post. You let us show it in ThrottleBase, and public routes stay for the community, without your name, if you delete your account.",
  ],
  sections: [
    {
      heading: "About these terms",
      blocks: [
        paragraph(
          "These terms are an agreement between you and [OPERATOR FULL NAME], an individual developer in India (\"we\", \"us\"), and apply to the ThrottleBase apps and throttlebase.in. By creating an account you agree to them and to our Privacy Policy.",
        ),
        paragraph(
          "If ThrottleBase moves to a company we set up, these terms and your account move to that company. We will tell you before it happens, and you can delete your account if you don't want to continue.",
        ),
      ],
    },
    {
      heading: "Who can use ThrottleBase",
      blocks: [
        list(
          "You must be at least 18 years old and able to enter into a contract under Indian law.",
          "ThrottleBase is offered for use in India.",
          "Keep one account, give accurate details, and keep access to your phone and email secure. You are responsible for what happens under your account.",
        ),
      ],
    },
    {
      heading: "Riding safely",
      blocks: [
        list(
          "Do not look at or touch the app while riding. Set up your ride before you start, mount your phone securely, and pull over safely if you need to use it. Using a handheld device while riding is an offence under the Motor Vehicles Act, 1988.",
          "Obey traffic laws, speed limits and road signs, wear a helmet and protective gear, and ride only when you are fit to.",
          "Location, speed, distance and time in the app are estimates. They can be wrong and must not be relied on to judge your speed, to navigate safely, or as evidence.",
          "Maps, directions, routes and road feedback come from other riders and third parties. They may be wrong, out of date or unsafe, and we do not check them. Always judge the road yourself.",
          "Stats, badges and rankings are for fun. They are never a reason to ride faster or to race on public roads.",
        ),
      ],
    },
    {
      heading: "Group alerts are not an emergency service",
      blocks: [
        paragraph(
          "Alert my group sends an alert with your location to the other riders on your ride, inside the app. It is not an emergency service and does not contact the police, an ambulance, fire services or anyone outside the ride. Alerts need network coverage and may be delayed, and they depend on your battery and permissions. In an emergency, call 112. The Call 112 button only opens your phone's dialer; you place the call yourself.",
        ),
      ],
    },
    {
      heading: "Group rides",
      blocks: [
        list(
          "ThrottleBase is a platform that helps riders plan and share rides. We do not organise, lead, supervise or insure any ride.",
          "Ride captains are responsible for the rides they plan. You decide whether to join a ride, and you take part at your own risk.",
          "If a ride's captain or a group's admin leaves ThrottleBase, we may make another member the captain or admin so the ride or group can go on.",
        ),
      ],
    },
    {
      heading: "Your content",
      blocks: [
        list(
          "You own the posts, comments, reviews, routes and other content you add.",
          "You give us a non-exclusive, royalty-free licence to store, show, copy and adapt it as needed to run ThrottleBase, for the people you share it with.",
          "When you make a route public, you also let us keep a copy after you delete your account, without your name or any link to you. Any end of the route that isn't at a public place (such as a hotel, café, fuel station, viewpoint or station) is shortened by about 500 m, and your own words on it (its name, stop names and notes) are replaced or removed. This lets other riders keep using it. This licence does not apply to private routes or routes shared with specific riders.",
          "Only add content you have the right to share.",
        ),
      ],
    },
    {
      heading: "What you must not do",
      blocks: [
        paragraph(
          "We do not tolerate objectionable content or abusive behaviour. You must not post, share or send anything that [LAWYER TO CONFIRM THE RULE 3 LIST]:",
        ),
        list(
          "belongs to someone else and you have no right to;",
          "is obscene, pornographic, paedophilic, or invades someone's privacy, including their bodily privacy;",
          "insults or harasses anyone on the basis of gender, or is racially or ethnically objectionable;",
          "relates to money laundering or gambling, or promotes enmity between groups on grounds of religion or caste with intent to incite violence;",
          "is harmful to children;",
          "infringes a patent, trademark, copyright or other rights;",
          "misleads people about where a message came from, or knowingly spreads information that is false or misleading;",
          "impersonates another person;",
          "threatens the unity, integrity, defence, security or sovereignty of India, its friendly relations with other countries, or public order, incites any offence, or obstructs an investigation;",
          "contains a virus or other code meant to disrupt or damage any computer resource;",
          "breaks any law in force.",
        ),
        paragraph("In ThrottleBase in particular, you must not:"),
        list(
          "promote or organise street racing, stunts or dangerous riding on public roads;",
          "share anyone else's location, home, number plate or other personal details without their consent;",
          "harass, threaten, stalk or spam other riders;",
          "create fake accounts, or scrape, copy or resell data from ThrottleBase;",
          "interfere with, overload or try to break into ThrottleBase, or reverse-engineer the apps except where the law allows.",
        ),
      ],
    },
    {
      heading: "Reporting, moderation and ending your access",
      blocks: [
        list(
          "To report content or a rider, tap Report on it in the app, or contact our Grievance Officer (below). Every report is a complaint to the Grievance Officer.",
          "We may remove content or restrict, suspend or close an account that breaks these terms or the law, and we act on valid orders from courts and the government within the time the law sets.",
          "Where the law requires, we keep removed content and related records for 180 days, or longer if the law requires, for investigations.",
          "We will tell you when we act against your account, unless the law or someone's safety prevents it.",
        ),
      ],
    },
    {
      heading: "Deleting your account",
      blocks: [
        paragraph(
          "You can delete your account at any time under Settings → Account → Delete account. What we keep afterwards, and for how long, is set out in the Privacy Policy.",
        ),
      ],
    },
    {
      heading: "Other services",
      blocks: [
        paragraph(
          "Maps and place search are provided by Google, and you may open directions in other navigation apps. Their own terms apply to their services, and we are not responsible for them.",
        ),
      ],
    },
    {
      heading: "Our liability",
      blocks: [
        paragraph("[LAWYER TO REVIEW THIS SECTION]"),
        list(
          "ThrottleBase is provided \"as is\". We work to keep it available and accurate, but we do not promise it will always work, be error-free, or be available where you ride.",
          "To the fullest extent the law allows, we are not liable for indirect or consequential loss, or for loss arising from rides, routes, road conditions or other riders' actions, and our total liability to you is limited to [LIABILITY CAP].",
          "Nothing in these terms limits liability that cannot be limited by law, including for our own negligence causing death or personal injury, or your rights as a consumer.",
          "You agree to compensate us for claims made against us because you broke these terms or the law.",
        ),
      ],
    },
    {
      heading: "Changes to these terms",
      blocks: [
        paragraph(
          "We will remind you of these terms at least once a year. When we change them we update the version and date, tell you in the app, and, for important changes, ask you to accept them again.",
        ),
      ],
    },
    {
      heading: "Law and disputes",
      blocks: [
        paragraph(
          "These terms are governed by the laws of India. The courts at [JURISDICTION CITY] have jurisdiction, without affecting your right to approach a consumer commission.",
        ),
      ],
    },
    {
      heading: "Grievance Officer",
      blocks: [
        paragraph("For complaints about content, another rider, or these terms, contact our Grievance Officer:"),
        list("[GRIEVANCE OFFICER NAME]", "Email: [GRIEVANCE OFFICER EMAIL]", "Address: [CONTACT ADDRESS]"),
        paragraph("We acknowledge complaints within 24 hours and resolve them within 7 days, or within 72 hours for sexual content. See throttlebase.in/grievance."),
      ],
    },
  ],
};
