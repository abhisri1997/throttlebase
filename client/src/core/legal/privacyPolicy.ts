/**
 * DRAFT — NOT LEGAL ADVICE. Written from docs/launch-readiness/data-inventory.md
 * so it describes what the app actually does; a lawyer must approve it before
 * `status` becomes "final". Keep it in step with the code: a new data type,
 * recipient or retention rule means a change here and a new `version`.
 */
import { list, paragraph, type LegalDocument } from "./legalDocument";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  version: "2026-09-29",
  status: "draft",
  summary: [
    "ThrottleBase is for riders aged 18 and over in India.",
    "We record your precise location only while you are on a ride you have started, and show it live only to the riders on that ride.",
    "We don't sell your data, show ads, or use analytics or advertising trackers.",
    "Google receives map, search and directions requests, which include locations, so we can show maps and plan routes.",
    "You can delete your account at any time in Settings. Your data is hidden at once and deleted after 30 days, with the few exceptions listed below.",
  ],
  sections: [
    {
      heading: "Who we are",
      blocks: [
        paragraph(
          "ThrottleBase is run by [OPERATOR FULL NAME], an individual developer in India (\"we\", \"us\"). We decide why and how your personal data is processed, which makes us the Data Fiduciary under India's Digital Personal Data Protection Act, 2023. If ThrottleBase moves to a company, we will update this policy and tell you before it happens.",
        ),
        paragraph(
          "This policy covers the ThrottleBase apps for Android and iOS and the website throttlebase.in. Questions: [CONTACT EMAIL].",
        ),
      ],
    },
    {
      heading: "What we collect and why",
      blocks: [
        paragraph("We collect only what the features you use need:"),
        list(
          "Account: your email address, name and profile photo from Google or the email you sign in with; the username, bio, city and riding experience you add. Used to create your account, sign you in, and show your profile to other riders.",
          "Sign-in and security: which sign-in method you use and its account ID; the IP address, device details and time of each sign-in and session; and the one-time codes we email you (stored only in scrambled form). Used to keep your account secure and to prevent abuse.",
          "Consent record: which version of these terms and this policy you accepted, when, and from which IP address. Used as proof of your consent.",
          "Location while riding: while you are on a ride you have started, your precise location every few seconds, with speed, direction, GPS accuracy and motion (for example riding, walking or stopped). Used to share your position live with the riders on that ride, to detect stops, and to build your ride history and stats.",
          "Ride plans: the rides you create or join, their meeting and destination points, stops, and the starting point you give for a ride. Used to organise the ride and to suggest a meeting point.",
          "Routes: the routes you save, including their line on the map, start and end, stops, notes and highlights, and how long you took to ride them. Used to let you and, if you choose, other riders find and follow them.",
          "Ride stats: distance, riding time and average and top speed for each ride, and your totals. Used for your ride history and profile.",
          "Community: your posts, comments, likes, follows, ride reviews, road feedback, mentions and the riders you block. Used to run the feed and social features.",
          "Group alerts: when you use Alert my group, its time and your location. Shared with the other riders on that ride so they can find you.",
          "Garage and preferences: vehicles and gear you add, your app settings, privacy choices and notification preferences.",
        ),
        paragraph(
          "We do not record audio, access your contacts, or collect photos from your device. We do not collect your date of birth, and we do not use your data for advertising or profiling.",
        ),
      ],
    },
    {
      heading: "Location",
      blocks: [
        list(
          "We ask for location permission to show where you are and to record rides.",
          "Once you start a ride, the app keeps recording while the screen is off or you use other apps, and shows a persistent notification while it does. Recording stops when you finish the ride or the ride ends.",
          "Your live position is visible only to the riders on the same ride, and only while the ride is live.",
          "If you give a starting point for a ride, the suggested meeting point is worked out from the starting points riders give. If you are the only one who gave one, the meeting point shown to the ride may be your starting point.",
          "You can turn location off in your phone's settings at any time. Ride recording and live sharing won't work without it.",
        ),
      ],
    },
    {
      heading: "Who can see what",
      blocks: [
        list(
          "Your profile (name, username, photo, bio, city, experience and ride totals) and your follower counts are visible to other signed-in riders. Your email address and phone number never are.",
          "Posts, comments, likes, ride reviews and road feedback are visible to other signed-in riders.",
          "Rides are public by default: signed-in riders can see the ride, its plan and who has joined. For a ride that needs approval, other signed-in riders see only its title, date, length, captain and number of riders; its meeting point, route and who has joined are shown only to riders the captain or a co-captain accepts. When you ask to join such a ride, its captain and co-captains see your name.",
          "Routes are private by default. You can share a route with specific riders or make it public, which lets every signed-in rider see and follow it. Other riders see it without its first and last 500 m or so, unless it starts or ends at a public place such as a hotel, café or fuel station, so it doesn't show where you set off from or arrive; a route too short to show that way can't be made public. You always see your own route whole.",
          "Your ride history is shown on your profile according to the privacy setting you choose in Settings.",
        ),
      ],
    },
    {
      heading: "Who we share data with",
      blocks: [
        paragraph(
          "We do not sell personal data. We share it only with the service providers that run ThrottleBase for us, under contracts that limit their use of it, and when the law requires:",
        ),
        list(
          "Supabase: our database, hosted in Mumbai, India.",
          "Railway: runs our servers, currently in Singapore.",
          "Cloudflare: network and security services for our domains.",
          "Google: Google Sign-In, if you use it, and Google Maps Platform (maps, place search, directions and addresses). Requests include the locations you look at, search for or plan with. Google's own privacy policy applies to its services.",
          "[EMAIL PROVIDER]: sends your sign-in codes and account emails.",
          "Navigation apps you choose, such as Google Maps or Waze, when you tap to navigate to a point.",
          "Government authorities or courts, when a law, court order or lawful request requires it, or to protect someone's life or safety.",
        ),
        paragraph(
          "Some of these providers process data outside India. We transfer data only to countries the Government of India has not restricted, and we require the same protection wherever it is processed.",
        ),
      ],
    },
    {
      heading: "How long we keep data",
      blocks: [
        list(
          "Most of your data, including your ride history, routes and posts, is kept until you delete it or your account.",
          "When you delete your account, you are signed out everywhere and your profile and content are hidden at once. Your data is deleted 30 days later.",
          "Registration details (your email, name, username, phone number, sign-in methods, when you registered, and the IP address you signed up from) are kept sealed and encrypted for 180 days after your account is deleted, as the Information Technology Rules, 2021 require, and then deleted. They can be opened only for a lawful request, such as a court order, and every opening is recorded. They are never used to contact you or for anything else.",
          "Public routes you created are kept after your account is deleted, without your name or any link to you. Where a route starts or finishes somewhere other than a public place such as a hotel, café, fuel station, viewpoint or station, about 500 m of that end is removed so it can't lead back to where you start or finish, and a route with less than 5 km left is deleted instead. The route's name, your stop notes and the name of each stop are replaced, and its ride time is removed. Private routes and routes shared with specific riders are deleted.",
          "Rides you took part in with other riders stay in their ride history; your own track, stats and participation are deleted.",
          "Sign-in and security records are kept for [SECURITY LOG RETENTION PERIOD].",
          "Records of your consent are kept for as long as we may need to show that you gave it.",
          "Content or records we are legally required to preserve, for example under a court order or after a complaint, are kept for 180 days or longer if the law requires.",
        ),
      ],
    },
    {
      heading: "Your rights",
      blocks: [
        paragraph("Under the Digital Personal Data Protection Act, 2023, you can:"),
        list(
          "Get a summary of the personal data we hold about you and how we use it.",
          "Correct or update it. You can edit most of your profile in the app.",
          "Have it erased. Delete your account in the app under Settings → Account → Delete account, or email [CONTACT EMAIL] from the address on your account.",
          "Withdraw your consent at any time, as easily as you gave it. Withdrawing doesn't affect processing before it, and features that need that data will stop working.",
          "Nominate someone to exercise these rights for you if you die or become unable to.",
          "Complain to us (see Grievance Officer below), and if you are not satisfied, to the Data Protection Board of India.",
        ),
        paragraph("Email [CONTACT EMAIL] to exercise any of these rights. We may need to confirm it is you before we act."),
      ],
    },
    {
      heading: "Keeping your data safe",
      blocks: [
        list(
          "All traffic between the app and our servers is encrypted.",
          "Sign-in tokens are stored in your phone's secure storage and expire regularly.",
          "Access to personal data is limited to the parts of ThrottleBase that need it.",
          "If a personal data breach affects you, we will tell you and the Data Protection Board of India as the law requires, including what happened and what you can do.",
        ),
      ],
    },
    {
      heading: "Children",
      blocks: [
        paragraph(
          "ThrottleBase is only for people aged 18 and over. We do not knowingly collect data from anyone younger. If we learn that an account belongs to someone under 18, we will delete it.",
        ),
      ],
    },
    {
      heading: "The website",
      blocks: [
        paragraph(
          "throttlebase.in uses no advertising, analytics or tracking cookies. If you sign in on the website, your browser's local storage keeps you signed in; signing out removes it.",
        ),
      ],
    },
    {
      heading: "Changes to this policy",
      blocks: [
        paragraph(
          "When we change this policy we update its version and date. If a change affects how we use your data, we will tell you in the app and, where the law requires, ask for your consent again.",
        ),
      ],
    },
    {
      heading: "Grievance Officer",
      blocks: [
        paragraph("For any complaint about your personal data or this policy, contact our Grievance Officer:"),
        list("[GRIEVANCE OFFICER NAME]", "Email: [GRIEVANCE OFFICER EMAIL]", "Address: [CONTACT ADDRESS]"),
        paragraph("We acknowledge complaints within 24 hours and aim to resolve them within 7 days."),
      ],
    },
  ],
};
