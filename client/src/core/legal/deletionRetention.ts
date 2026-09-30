/**
 * What happens to a rider's data when they delete their account, shared by
 * the Privacy Policy and the deletion page (accountDeletion.ts) so the two
 * can never say different things. DRAFT — NOT LEGAL ADVICE, like both of them.
 */

export const ON_ACCOUNT_DELETION =
  "When you delete your account, you are signed out everywhere and your profile and content are hidden at once. Your data is deleted 30 days later.";

export const SEALED_REGISTRATION_RECORD =
  "Registration details (your email, name, username, phone number, sign-in methods, when you registered, and the IP address you signed up from) are kept sealed and encrypted for 180 days after your account is deleted, as the Information Technology Rules, 2021 require, and then deleted. They can be opened only for a lawful request, such as a court order, and every opening is recorded. They are never used to contact you or for anything else.";

export const PUBLIC_ROUTES_KEPT =
  "Public routes you created are kept after your account is deleted, without your name or any link to you. Where a route starts or finishes somewhere other than a public place such as a hotel, café, fuel station, viewpoint or station, about 500 m of that end is removed so it can't lead back to where you start or finish, and a route with less than 5 km left is deleted instead. The route's name, your stop notes and the name of each stop are replaced, and its ride time is removed. Private routes and routes shared with specific riders are deleted.";

export const SHARED_RIDES_KEPT =
  "Rides you took part in with other riders stay in their ride history; your own track, stats and participation are deleted.";

/** The periods are server/src/core/retention/retentionPolicy.ts; change both together. */
export const SECURITY_RECORDS_KEPT =
  "Sign-in records (when you signed in, from which IP address and on which device) are kept for 1 year, or until your data is deleted if you delete your account sooner. Email codes you ask for, with the IP address they were requested from, are kept for 30 days. Other security records, such as moderation decisions, are kept for 1 year.";

/** The period is INCIDENT_RETENTION_DAYS in server/src/core/retention/retentionPolicy.ts. */
export const RIDE_ALERTS_KEPT =
  "Alerts raised during a ride, with where they were raised, stay with the ride for 180 days and are then deleted.";

export const LEGALLY_PRESERVED =
  "Content or records we are legally required to preserve, for example under a court order or after a complaint, are kept for 180 days or longer if the law requires.";
