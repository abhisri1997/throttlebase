# Plan — Logging (E10, E11)

**Decision (2026-09-29):**
- Replace ad-hoc `console.*` with structured, redacted logging.
- Keep security-relevant events in the database.
- Retain logs for 180 days in Indian jurisdiction, as CERT-In requires.

## Today

- **Server.** 163 `console.*` calls go to stdout, collected by Railway. There is no logger, no levels, no request IDs, no redaction, and no retention setting.
- **Personal data in logs:**
  - `server/src/workers/processors/notification-delivery.processor.ts:128` logs the rider id and push token, and `:190` logs the recipient email. This processor runs in **every** environment, production included. It is not the dev-only email driver.
  - `server/src/adapters/email/consoleEmailSender.ts:14` logs the email address and sign-in code. This is the development driver, and production refuses to boot with it unless `ALLOW_CONSOLE_EMAIL=true` (`server/src/composition/createEmailSender.ts`). Keep it that way.
  - `server/src/realtime/gateway.ts:333` logs whole error objects on `location:update`.
- **Client.** `client/src/utils/reverseGeocode.ts:45` logs coordinates. Release builds keep all `console.*`.

## Build

1. **Logger module** (`server/src/adapters/logging/logger.ts`, behind a `Logger` port so `core/` stays vendor-free):
   - `pino`, JSON in production and pretty in development;
   - level from `LOG_LEVEL`;
   - base fields `service` (api or worker), `env` and `version` (git SHA).
2. **Redaction by default.** Use pino `redact` paths for:
   - `req.headers.authorization`, `req.headers.cookie`;
   - `*.token`, `*.refreshToken`, `*.accessToken`, `*.code`, `*.otp`;
   - `*.email`, `*.phone*`;
   - `*.lat`, `*.lng`, `*.lon`, `*.latitude`, `*.longitude`, `*.location`, `*.coords*`;
   - `*.password`.

   Beyond that:
   - Never log request or response bodies.
   - Log IDs (riderId, rideId, sessionId), never contents.
   - A serializer for `Error` keeps `name`, `message`, `code` and `stack`, and drops attached `params` / `detail` fields (pg errors can echo values).
3. **Request logging.** `pino-http` logs method, route template (not the raw URL with query), status, duration, `requestId` (taken from `x-request-id` or generated, and echoed in the response) and `riderId` when authenticated.
   - Socket events: one line per connect and disconnect with `socketId` and `riderId`, with no payloads.
4. **Remove the leaking lines** listed above. The notification stubs log `notificationId`, `riderId` and outcome only. When real email or push lands, the provider's message ID is logged, never the address or token.
5. **`security_events` table (additive).**
   - Columns: `id`, `occurred_at`, `rider_id` (nullable), `event` (enum), `ip` (inet), `user_agent`, `request_id`, `metadata` (jsonb, no personal data).
   - Events:
     - `auth.sign_in`, `auth.sign_in_failed`, `auth.refresh_reuse_detected`, `auth.logout`, `auth.logout_all`;
     - `account.deleted`, `consent.granted`, `consent.withdrawn`;
     - `admin.*` (every admin action, with the target ID and reason), which is the E10 admin audit log;
     - `moderation.*`.
   - This replaces `login_activity` for new writes. `login_activity` stays readable until its rows age out.
6. **Retention and residency** (E11, CERT-In):
   - `security_events` purge job keeps **180 days**. Extend to 1 year if counsel says the DPDP Rules' one-year log requirement applies. ⚖️
   - Application logs:
     - Ship them to storage pinned to India. For example, a batch exporter writes gzipped JSON to a Supabase Storage (ap-south-1) bucket or an S3 bucket in `ap-south-1`, with 180-day lifecycle rules.
     - Keep Railway's own log view for short-term debugging only.
     - Record the chosen destination and region in `data-inventory.md`. ⚖️
   - Clock sync: note in `incident-response.md` that Railway and Supabase hosts sync to NTP, and confirm the sources.
7. **Client.**
   - Add `babel-plugin-transform-remove-console` for release builds (keep `error`).
   - Replace direct `console` calls with a tiny `log` helper that no-ops in release.
   - Crash reporting (Sentry or similar) with `sendDefaultPii: false`, a `beforeSend` scrubber for emails, tokens and coordinates, and no breadcrumbs containing URLs with query strings.
   - Disclose the vendor and its region (typically US or EU, a cross-border transfer) in the privacy policy. ⚖️
8. **Guardrail test.** A test pipes a set of representative requests through the app with a capturing logger and fails if any line matches an email regex, a JWT pattern, or a `lat`/`lng` pair.

## Rollout

1. Build the logger, redaction and request IDs, and remove the leaking lines.
2. Add the `security_events` table, emit events from `core/auth` and the admin middleware, and add the purge job.
3. Add the India log sink and retention.
4. Migrate the remaining `console.*` module by module. `lint:boundaries` can forbid `console` in `server/src` once done.
5. Client: strip console in release and add crash reporting.

## Docs to update

- `data-inventory.md` §7 and §8.
- `incident-response.md`: where logs live and how to pull them within the 6-hour CERT-In window.
