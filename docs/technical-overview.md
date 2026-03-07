# Technical Overview — ThrottleBase

---

## Table of Contents

- [Functional Core Feature Details](#functional-core-feature-details)
  - [Create Rides](#create-rides)
  - [Join Rides](#join-rides)
  - [Share Routes](#share-routes)
  - [Track Ride History](#track-ride-history)
  - [Rider Profiles](#rider-profiles)
- [Functional Additional Feature Details](#functional-additional-feature-details)
  - [Rider Reward System](#rider-reward-system)
  - [Rider Notifications](#rider-notifications)
  - [Rider Settings](#rider-settings)
  - [Rider Privacy Settings](#rider-privacy-settings)
  - [Rider Security Settings](#rider-security-settings)
  - [Rider Support](#rider-support)
  - [Interact with Community](#interact-with-community)
- [Technical Core Feature Details](#technical-core-feature-details)
  - [Create Rides (Technical)](#create-rides-technical)
  - [Join Rides (Technical)](#join-rides-technical)
  - [Share Routes (Technical)](#share-routes-technical)
  - [Track Ride History (Technical)](#track-ride-history-technical)
  - [Rider Profiles (Technical)](#rider-profiles-technical)
- [Technical Additional Feature Details](#technical-additional-feature-details)
  - [Rider Reward System (Technical)](#rider-reward-system-technical)
  - [Rider Notifications (Technical)](#rider-notifications-technical)
  - [Rider Settings (Technical)](#rider-settings-technical)
  - [Rider Privacy Settings (Technical)](#rider-privacy-settings-technical)
  - [Rider Security Settings (Technical)](#rider-security-settings-technical)
  - [Rider Support (Technical)](#rider-support-technical)
  - [Interact with Community (Technical)](#interact-with-community-technical)

---

# Functional Core Feature Details

## Create Rides

- Define point-to-point routes with optional intermediate stops for fuel, rest, or photo breaks.
- Start point is either manually selected by the captain or auto-calculated as equidistant from all confirmed riders.
- Rides can be saved as **Draft**, **Published (Public)**, or **Published (Private)**.
- The creator of the ride becomes the **Captain**.
- The captain can promote one or more riders to **Co-Captain**, granting them the ability to edit or delete the ride.
- Any rider within the ride can **request a stop** at any point on the route; the captain approves or rejects the request.
- Rides can define **requirements** for riders to join (e.g., minimum experience level, specific vehicle type, mandatory riding gear).
- Rides have a defined **date, time, and estimated duration**.
- A ride can optionally have a **max rider capacity**.

## Join Rides

- **Private rides**: Only the captain or co-captain can invite riders via invitation link or QR code.
- **Public rides**: Any rider can request to join if they meet the ride's requirements.
- Riders can join **only one ride** for any overlapping time period (conflict detection).
- Join methods: invitation link, direct in-app join, or QR code scan.
- Riders can **leave a ride** before it starts; leaving an active ride marks them as "dropped out."
- Riders receive a **confirmation notification** upon successful join.

## Share Routes

- Riders can share routes with specific riders, the ride captain, or the entire community.
- Riders can propose **alternate routes** for an already-created ride, visible to the captain and other participants.
- Shared routes can be **bookmarked** by other riders for future use.
- Routes can be exported/shared externally via a shareable link.

## Track Ride History

- Full ride history is recorded for every rider, including:
  - Total distance covered
  - Total ride time and moving time
  - Average and max speed
  - Elevation gain/loss
  - All stops (fuel, rest, unplanned)
  - Calories burned (estimated)
  - Route taken (with GPS trace)
- Riders can view ride history as a **timeline** or **list view**.
- Ride history is visible on the rider's profile (subject to privacy settings).
- Riders can **compare rides** side-by-side.

## Rider Profiles

- Riders can create and update profiles with:
  - Display name and bio
  - Profile picture
  - Vehicle details (make, model, year, engine capacity)
  - Experience level (beginner, intermediate, expert)
  - Riding gear details
  - Location (city/region)
- Riders can **delete their profile** and associated data (soft-delete with a grace period).
- Profiles display ride statistics (total rides, total distance, total time, etc.).
- Profiles display earned badges and achievements.

---

# Functional Additional Feature Details

## Rider Reward System

### Rider Badges

- Badges are earned by completing specific milestones (e.g., "First Ride", "100 km Club", "Night Rider", "Rain Rider", "Captain's Badge").
- Badges are displayed on the rider's profile.
- New badge categories can be added over time without code changes (data-driven).

### Rider Achievements

- Achievements track cumulative progress (e.g., total rides completed, total distance ridden, consecutive weeks with a ride).
- Progress bars or visual indicators show how close a rider is to the next achievement tier.
- Achievements unlock profile flair or cosmetic rewards.

### Rider Leaderboard

- Leaderboards rank riders by various metrics: distance ridden, rides completed, badges earned, etc.
- Leaderboards can be filtered by **time period** (weekly, monthly, all-time) and **region**.
- Riders can opt out of leaderboard visibility in their privacy settings.

## Rider Notifications

- Push notifications and in-app notifications for:
  - Ride invitations and join requests
  - Ride status changes (scheduled → active → completed)
  - Stop requests from riders during a ride
  - Badge and achievement unlocks
  - Community posts and interactions (comments, likes)
  - System announcements
- Notification preferences are configurable per notification type (push, in-app, email).

## Rider Settings

- General settings:
  - Theme preference (dark/light mode)
  - Language preference
  - Distance unit (km / miles)
  - Speed unit (km/h / mph)
  - Date/time format
- Account settings:
  - Update email address
  - Update phone number
  - Change password
  - Linked social accounts

## Rider Privacy Settings

- Control profile visibility: **Public**, **Riders Only**, or **Private**.
- Control ride history visibility: **Public**, **Riders Only**, or **Private**.
- Control leaderboard participation: opt-in / opt-out.
- Block specific riders.
- Control who can send ride invitations: **Everyone**, **Followers Only**, or **No One**.

## Rider Security Settings

- Two-factor authentication (2FA) via authenticator app or SMS.
- Login activity log (device, IP, timestamp).
- Active sessions management (view and revoke).
- Password change and account recovery options.
- Account deactivation and permanent deletion.

## Rider Support

- In-app support chat or contact form.
- Searchable FAQ / knowledge base.
- Bug/issue reporting with screenshot attachment.
- Ride dispute resolution (e.g., reporting a ride captain or rider).
- Response tracking with ticket status.

## Interact with Community

- **Community Feed**: riders can post text, images, and route shares.
- **Comments and Likes** on community posts.
- **Follow/Unfollow** other riders.
- **Community Groups**: riders can create or join topic-based groups (e.g., "Weekend Warriors", "Long-Distance Tourers").
- **Ride Reviews**: riders can rate and review completed rides.
- **Mentions** (`@rider`) in posts and comments.

---

# Technical Core Feature Details

## Create Rides (Technical)

- Integration with mapping services (e.g., **Mapbox** or **Google Maps**) for route calculation, geocoding, and waypoint management.
- Store and render route paths and waypoints using **GeoJSON** format.
- Implementation of a **rule engine** to validate rider requirements against profile data (e.g., vehicle type, experience level, gear).
- Real-time stop request handling via **WebSockets** to notify the captain of rider suggestions during an active ride.
- Ride state machine: `Draft → Scheduled → Active → Completed | Cancelled`, with transition guards and event hooks.
- Equidistant start point calculated using a **geographic centroid** algorithm over the confirmed riders' locations.
- Store ride metadata, route data, and rider associations in a relational database with PostGIS-enabled spatial queries.
- Enforce max capacity via an atomic join counter with optimistic locking to prevent race conditions.

## Join Rides (Technical)

- Invitation links and QR codes generated as **signed, time-limited tokens** (JWT or HMAC-based) to prevent unauthorized joins.
- **Conflict detection** logic: on join request, query the rider's existing rides for overlapping time windows; reject if any overlap exists.
- Join flow:
  - Public ride → rider requests → system validates requirements → auto-approve or captain-approve.
  - Private ride → captain sends invite → rider accepts → system validates requirements → join confirmed.
- Real-time join/leave events broadcast to ride participants via **WebSocket channels** (one channel per ride).
- Departure ("dropped out") events recorded with timestamp and GPS coordinates for ride analytics.

## Share Routes (Technical)

- Routes stored as **GeoJSON LineString** objects with associated metadata (distance, elevation, difficulty rating).
- Sharing implemented via a **permissions model**: each route has an ACL (access control list) defining visibility — private, specific riders, or public.
- Alternate route proposals linked to the parent ride via a foreign key; captain can accept, reject, or merge.
- External share links are **read-only, tokenized URLs** with optional expiry.
- Bookmarked routes stored as a many-to-many relationship between riders and routes.

## Track Ride History (Technical)

- **GPS trace recording**: client-side location tracking at configurable intervals (e.g., every 5 seconds), batched and uploaded to the server periodically (e.g., every 30 seconds) and on ride completion.
- GPS data stored as time-series points: `(latitude, longitude, altitude, speed, timestamp)`.
- Post-ride analytics computed asynchronously via a **background job**:
  - Total distance (Haversine or Vincenty formula over GPS points).
  - Moving time vs. total time (speed threshold to detect stops).
  - Elevation gain/loss (smoothed to reduce GPS noise).
  - Calorie estimation based on ride duration, speed, and rider weight (if provided).
- Ride comparison queries pull two ride records and compute deltas on key metrics.
- Ride history queryable with **pagination, filtering** (date range, distance, duration), and **sorting**.

## Rider Profiles (Technical)

- Profile data stored in a `riders` table with associated `vehicles` (one-to-many) and `gear` (one-to-many) tables.
- Profile pictures uploaded to **object storage** (e.g., S3-compatible); thumbnails generated asynchronously via an image processing worker.
- Soft-delete implementation: `deleted_at` timestamp field; a scheduled job permanently purges records after the grace period (e.g., 30 days).
- Profile statistics (total rides, total distance, etc.) are **pre-computed and cached** to avoid expensive aggregation queries on every profile view.
- Profile search/discovery powered by **full-text search** with filters (location, experience level, vehicle type).

---

# Technical Additional Feature Details

## Rider Reward System (Technical)

### Badges

- Badge definitions stored in a `badges` table (data-driven): `{ id, name, description, icon_url, criteria_type, criteria_value }`.
- Badge evaluation triggered **asynchronously** after ride completion or profile update events via an event bus / message queue.
- Criteria engine evaluates badge conditions (e.g., `criteria_type: "total_distance" >= criteria_value: 100`).
- Awarded badges stored in a `rider_badges` join table with `awarded_at` timestamp.

### Achievements

- Achievements modeled as **tiered milestones**: `{ id, name, tier, threshold }` (e.g., "Distance Pro" — Tier 1: 100 km, Tier 2: 500 km, Tier 3: 1000 km).
- Progress tracked in a `rider_achievements` table: `{ rider_id, achievement_id, current_value, current_tier }`.
- Progress updated via the same event-driven pipeline as badges.

### Leaderboard

- Leaderboard data powered by **pre-aggregated materialized views** or cached rankings, refreshed periodically (e.g., every hour or on-demand via cache invalidation).
- Regional filtering uses the rider's location field; time-period filtering uses ride completion timestamps.
- Riders who opt out are excluded from leaderboard queries at the database level.

## Rider Notifications (Technical)

- **Push notifications**: delivered via **Firebase Cloud Messaging (FCM)** for Android and **APNs** for iOS.
- **In-app notifications**: stored in a `notifications` table and delivered to the client via WebSocket (real-time) or REST polling (fallback).
- **Email notifications**: sent via a transactional email service (e.g., SendGrid, AWS SES) for critical events (account security, ride reminders).
- Notification preferences stored per rider per notification type in a `notification_preferences` table.
- Notifications dispatched via an **event-driven architecture**: ride events, badge events, community events → message queue → notification workers → delivery channel.

## Rider Settings (Technical)

- Settings stored in a `rider_settings` table as key-value pairs or a JSONB column for flexibility.
- Settings updates are **immediate** (no batch save); each update writes to the database and invalidates any cached settings.
- Unit/format preferences applied **client-side** for display; all data stored in canonical units server-side (metric, UTC).

## Rider Privacy Settings (Technical)

- Privacy settings enforce **row-level visibility** in database queries: profile, ride history, and leaderboard queries join against privacy settings to filter results.
- Block list stored in a `blocked_riders` table; blocked riders are excluded from search results, ride invitations, and community interactions.
- Invitation control preferences checked at the API layer before dispatching an invite notification.

## Rider Security Settings (Technical)

- **2FA**: TOTP-based (RFC 6238) with QR code provisioning for authenticator apps; SMS fallback via a telephony provider (e.g., Twilio).
- **Login activity log**: recorded on every authentication event — stores device fingerprint, IP address, geolocation (via IP), and timestamp.
- **Session management**: JWT access tokens (short-lived) + refresh tokens (long-lived, rotatable). Active sessions listed by refresh token; riders can revoke individual sessions.
- **Password hashing**: bcrypt or Argon2id with appropriate cost factors.
- **Account deletion**: triggers the soft-delete flow in Rider Profiles; all associated data (rides, routes, badges) is anonymized or purged after the grace period.

## Rider Support (Technical)

- Support tickets stored in a `support_tickets` table: `{ id, rider_id, category, subject, description, status, created_at, updated_at }`.
- File attachments (screenshots) uploaded to object storage and linked to the ticket.
- FAQ / knowledge base served as **static content** managed via a CMS or markdown files, searchable via full-text index.
- Ticket status lifecycle: `Open → In Progress → Awaiting Rider → Resolved → Closed`.
- Optional integration with a third-party helpdesk (e.g., Zendesk, Freshdesk) via API for agent-side management.

## Interact with Community (Technical)

- **Community Feed**: posts stored in a `posts` table with `{ id, rider_id, content, media_urls, created_at }`. Feed served as a **reverse-chronological** list with pagination; future optimization via a fan-out-on-write feed cache.
- **Comments and Likes**: stored in `comments` and `likes` tables; like counts denormalized on the `posts` table for fast reads.
- **Follow graph**: stored in a `follows` table `{ follower_id, following_id }`; used to build personalized feeds and control invitation permissions.
- **Community Groups**: `groups` table with `group_members` join table. Groups can be public or private (invite-only).
- **Ride Reviews**: stored in a `ride_reviews` table: `{ ride_id, rider_id, rating, review_text, created_at }`. Average rating denormalized on the ride record.
- **Mentions**: parsed from post/comment content using regex (`@username`), resolved to rider IDs, and trigger notification dispatch.
