/// <reference types="node" />

import { io as socketIoClient } from "socket.io-client";
import { processLiveIncidentReported } from "./src/workers/processors/live-notification.processor.js";
import {
  processLiveSessionEnded,
  processLiveSessionStarted,
} from "./src/workers/processors/live-session.processor.js";
import { query } from "./src/config/db.js";
import {
  getLiveLocationDropTelemetry,
  updateLivePresenceLocation,
} from "./src/services/live-session.service.js";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5001";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || "Ch@ngeMeInCI!23";

type LoginResponse = {
  token?: string;
};

type RiderProfileResponse = {
  rider?: {
    id?: string;
    display_name?: string;
  };
};

type LiveHealthResponse = {
  module: string;
  phase: number;
  status: {
    has_sessions: boolean;
    has_presence: boolean;
    has_events: boolean;
    has_samples: boolean;
    has_incidents: boolean;
  };
};

type CreateRideResponse = {
  ride?: { id?: string; status?: string };
};

type LiveSessionEnvelope = {
  session?: {
    id: string;
    ride_id: string;
    status: string;
    participants?: Array<{
      rider_id: string;
      last_heartbeat_at: string | null;
    }>;
  };
};

type IncidentEnvelope = {
  incident?: {
    id: string;
    status: string;
  };
};

type NotificationItem = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  data?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const registerAndLogin = async (label: string) => {
  const now = Date.now();
  const email = `${label}.${now}@example.com`;
  const username = `${label.replace(/[^a-zA-Z0-9_]/g, "_")}_${now}`;
  const password = TEST_PASSWORD;

  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      display_name: `${label} ${now}`,
      username,
    }),
  });
  assert(registerRes.ok, `Register failed with status ${registerRes.status}`);

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  assert(loginRes.ok, `Login failed with status ${loginRes.status}`);

  const loginData = (await loginRes.json()) as LoginResponse;
  assert(Boolean(loginData.token), "Login token missing from response");
  return loginData.token as string;
};

const authedRequest = (token: string, path: string, init?: RequestInit) => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(init?.headers || {}),
  };

  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });
};

const getMyProfile = async (token: string) => {
  const res = await authedRequest(token, "/api/riders/me");
  assert(res.ok, `Get my profile failed with status ${res.status}`);

  const body = (await res.json()) as RiderProfileResponse;
  assert(Boolean(body?.rider?.id), "Rider ID missing from profile response");
  return body.rider as { id: string; display_name?: string };
};

const getNotifications = async (token: string) => {
  const res = await authedRequest(token, "/api/notifications");
  assert(res.ok, `Get notifications failed with status ${res.status}`);

  return (await res.json()) as NotificationItem[];
};

const setNotificationPreference = async (
  token: string,
  notificationType: string,
  inAppEnabled: boolean,
) => {
  const res = await authedRequest(token, "/api/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify({
      notification_type: notificationType,
      in_app_enabled: inAppEnabled,
    }),
  });

  assert(
    res.ok,
    `Set notification preference failed with status ${res.status}`,
  );
};

const joinRide = async (token: string, rideId: string) => {
  const res = await authedRequest(token, `/api/rides/${rideId}/join`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  assert(res.ok, `Join ride failed with status ${res.status}`);
};

const findNotificationByDedupeKey = (
  notifications: NotificationItem[],
  type: string,
  dedupeKey: string,
) =>
  notifications.find(
    (notification) =>
      notification.type === type && notification.data?.dedupe_key === dedupeKey,
  ) ?? null;

const countNotificationsByDedupeKey = (
  notifications: NotificationItem[],
  type: string,
  dedupeKey: string,
) =>
  notifications.filter(
    (notification) =>
      notification.type === type && notification.data?.dedupe_key === dedupeKey,
  ).length;

const getParticipantHeartbeatMs = (
  session: LiveSessionEnvelope,
  riderId: string,
): number => {
  const participant = session.session?.participants?.find(
    (entry) => entry.rider_id === riderId,
  );
  assert(Boolean(participant), `Missing participant in session: ${riderId}`);
  assert(
    Boolean(participant?.last_heartbeat_at),
    `Missing last_heartbeat_at for participant: ${riderId}`,
  );

  const parsed = Date.parse(participant!.last_heartbeat_at as string);
  assert(Number.isFinite(parsed), "Participant heartbeat timestamp is invalid");
  return parsed;
};

const run = async () => {
  const captainToken = await registerAndLogin("live.health.captain");
  const participantToken = await registerAndLogin("live.health.participant");
  const mutedToken = await registerAndLogin("live.health.muted");
  const outsiderToken = await registerAndLogin("live.health.outsider");

  const captain = await getMyProfile(captainToken);
  const participant = await getMyProfile(participantToken);
  const mutedParticipant = await getMyProfile(mutedToken);

  const healthRes = await authedRequest(captainToken, "/api/live/health");
  assert(
    healthRes.ok,
    `/api/live/health failed with status ${healthRes.status}`,
  );

  const healthData = (await healthRes.json()) as LiveHealthResponse;
  const allTrue =
    healthData?.status?.has_sessions &&
    healthData?.status?.has_presence &&
    healthData?.status?.has_events &&
    healthData?.status?.has_samples &&
    healthData?.status?.has_incidents;
  assert(allTrue, "Live health flags are not all true");

  const createRideRes = await authedRequest(captainToken, "/api/rides", {
    method: "POST",
    body: JSON.stringify({
      title: `Live Test Ride ${Date.now()}`,
      visibility: "public",
      status: "scheduled",
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      description: "Phase 1 integration test ride",
    }),
  });
  assert(
    createRideRes.ok,
    `Create ride failed with status ${createRideRes.status}`,
  );

  const rideData = (await createRideRes.json()) as CreateRideResponse;
  const rideId = rideData?.ride?.id;
  assert(Boolean(rideId), "Ride ID missing from create response");

  await joinRide(participantToken, rideId as string);
  await joinRide(mutedToken, rideId as string);

  await setNotificationPreference(mutedToken, "live_session_started", false);

  const outsiderSessionRes = await authedRequest(
    outsiderToken,
    `/api/rides/${rideId}/live/session`,
  );
  assert(
    outsiderSessionRes.status === 403,
    `Expected outsider session access to be 403, got ${outsiderSessionRes.status}`,
  );

  const startRes = await authedRequest(
    captainToken,
    `/api/rides/${rideId}/live/start`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  assert(
    startRes.status === 201 || startRes.status === 200,
    `Start live session failed with status ${startRes.status}`,
  );

  const startData = (await startRes.json()) as LiveSessionEnvelope;
  assert(
    startData?.session?.status === "active",
    "Session did not become active",
  );
  assert(Boolean(startData?.session?.id), "Session ID missing from start");

  const sessionId = startData.session!.id;

  await processLiveSessionStarted({
    rideId,
    actorRiderId: captain.id,
  });
  await processLiveSessionStarted({
    rideId,
    actorRiderId: captain.id,
  });

  const sessionRes = await authedRequest(
    captainToken,
    `/api/rides/${rideId}/live/session`,
  );
  assert(
    sessionRes.ok,
    `Get live session failed with status ${sessionRes.status}`,
  );

  const sessionData = (await sessionRes.json()) as LiveSessionEnvelope;
  assert(
    sessionData?.session?.status === "active",
    "Fetched session is not active",
  );

  const acceptedLocation = await updateLivePresenceLocation(
    rideId as string,
    participant.id,
    {
      lon: 77.612,
      lat: 12.933,
      speed_kmh: 24,
      captured_at: new Date().toISOString(),
    },
  );
  assert(Boolean(acceptedLocation), "Expected fresh location update to be accepted");

  const sessionAfterAcceptedRes = await authedRequest(
    participantToken,
    `/api/rides/${rideId}/live/session`,
  );
  assert(
    sessionAfterAcceptedRes.ok,
    `Get live session after accepted location failed with status ${sessionAfterAcceptedRes.status}`,
  );
  const sessionAfterAccepted =
    (await sessionAfterAcceptedRes.json()) as LiveSessionEnvelope;
  const baselineHeartbeatMs = getParticipantHeartbeatMs(
    sessionAfterAccepted,
    participant.id,
  );

  const staleLocation = await updateLivePresenceLocation(
    rideId as string,
    participant.id,
    {
      lon: 77.613,
      lat: 12.934,
      captured_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  );
  assert(staleLocation === null, "Expected stale location update to be dropped");

  const futureLocation = await updateLivePresenceLocation(
    rideId as string,
    participant.id,
    {
      lon: 77.614,
      lat: 12.935,
      captured_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  );
  assert(
    futureLocation === null,
    "Expected future-skewed location update to be dropped",
  );

  const outOfOrderLocation = await updateLivePresenceLocation(
    rideId as string,
    participant.id,
    {
      lon: 77.615,
      lat: 12.936,
      captured_at: new Date(baselineHeartbeatMs - 60 * 1000).toISOString(),
    },
  );
  assert(
    outOfOrderLocation === null,
    "Expected out-of-order location update to be dropped",
  );

  const sessionAfterDropsRes = await authedRequest(
    participantToken,
    `/api/rides/${rideId}/live/session`,
  );
  assert(
    sessionAfterDropsRes.ok,
    `Get live session after dropped location checks failed with status ${sessionAfterDropsRes.status}`,
  );
  const sessionAfterDrops =
    (await sessionAfterDropsRes.json()) as LiveSessionEnvelope;
  const heartbeatAfterDropsMs = getParticipantHeartbeatMs(
    sessionAfterDrops,
    participant.id,
  );

  assert(
    heartbeatAfterDropsMs === baselineHeartbeatMs,
    "Dropped location packets should not advance participant heartbeat timestamp",
  );

  const locationDropTelemetry = getLiveLocationDropTelemetry();
  if (locationDropTelemetry.enabled) {
    assert(
      locationDropTelemetry.total_dropped >= 3,
      "Expected telemetry total_dropped to include stale/future/out-of-order drops",
    );
    assert(
      locationDropTelemetry.stale >= 1,
      "Expected telemetry stale drop counter to increment",
    );
    assert(
      locationDropTelemetry.future_skew >= 1,
      "Expected telemetry future_skew drop counter to increment",
    );
    assert(
      locationDropTelemetry.out_of_order >= 1,
      "Expected telemetry out_of_order drop counter to increment",
    );
  }

  const startedDedupeKey = `live_session_started:${sessionId}`;
  const captainNotificationsAfterStart = await getNotifications(captainToken);
  const participantNotificationsAfterStart =
    await getNotifications(participantToken);
  const mutedNotificationsAfterStart = await getNotifications(mutedToken);

  assert(
    countNotificationsByDedupeKey(
      captainNotificationsAfterStart,
      "live_session_started",
      startedDedupeKey,
    ) === 0,
    "Captain should not receive own live session started notification",
  );

  const participantStartedNotification = findNotificationByDedupeKey(
    participantNotificationsAfterStart,
    "live_session_started",
    startedDedupeKey,
  );
  assert(
    Boolean(participantStartedNotification),
    "Confirmed participant did not receive live session started notification",
  );
  assert(
    participantStartedNotification?.data?.ride_id === rideId,
    "Started notification missing ride_id",
  );
  assert(
    participantStartedNotification?.data?.session_id === sessionId,
    "Started notification missing session_id",
  );
  assert(
    participantStartedNotification?.data?.actor_rider_id === captain.id,
    "Started notification missing actor rider ID",
  );
  assert(
    countNotificationsByDedupeKey(
      participantNotificationsAfterStart,
      "live_session_started",
      startedDedupeKey,
    ) === 1,
    "Started notification dedupe failed for confirmed participant",
  );
  assert(
    countNotificationsByDedupeKey(
      mutedNotificationsAfterStart,
      "live_session_started",
      startedDedupeKey,
    ) === 0,
    "Muted participant should not receive live session started notification",
  );

  const incidentRes = await authedRequest(
    participantToken,
    `/api/rides/${rideId}/live/incident`,
    {
      method: "POST",
      body: JSON.stringify({
        severity: "high",
        kind: "mechanical",
        metadata: { source: "integration-test" },
      }),
    },
  );
  assert(
    incidentRes.status === 201,
    `Incident create failed with status ${incidentRes.status}`,
  );

  const incidentData = (await incidentRes.json()) as IncidentEnvelope;
  const incidentId = incidentData?.incident?.id;
  assert(Boolean(incidentId), "Incident ID missing from response");

  await processLiveIncidentReported({
    incidentId,
    rideId,
    severity: "high",
    reporterRiderId: participant.id,
  });
  await processLiveIncidentReported({
    incidentId,
    rideId,
    severity: "high",
    reporterRiderId: participant.id,
  });

  const incidentDedupeKey = `live_incident_reported:${incidentId}`;
  const captainNotificationsAfterIncident =
    await getNotifications(captainToken);
  const participantNotificationsAfterIncident =
    await getNotifications(participantToken);
  const mutedNotificationsAfterIncident = await getNotifications(mutedToken);

  const captainIncidentNotification = findNotificationByDedupeKey(
    captainNotificationsAfterIncident,
    "live_incident_reported",
    incidentDedupeKey,
  );
  const mutedIncidentNotification = findNotificationByDedupeKey(
    mutedNotificationsAfterIncident,
    "live_incident_reported",
    incidentDedupeKey,
  );

  assert(
    Boolean(captainIncidentNotification),
    "Captain did not receive live incident notification",
  );
  assert(
    Boolean(mutedIncidentNotification),
    "Other confirmed participant did not receive live incident notification",
  );
  assert(
    countNotificationsByDedupeKey(
      participantNotificationsAfterIncident,
      "live_incident_reported",
      incidentDedupeKey,
    ) === 0,
    "Incident reporter should not receive own live incident notification",
  );
  assert(
    countNotificationsByDedupeKey(
      captainNotificationsAfterIncident,
      "live_incident_reported",
      incidentDedupeKey,
    ) === 1,
    "Incident notification dedupe failed for captain",
  );
  assert(
    captainIncidentNotification?.data?.severity === "high" &&
      captainIncidentNotification?.data?.kind === "mechanical",
    "Incident notification missing severity/kind metadata",
  );
  assert(
    captainIncidentNotification?.data?.incident_id === incidentId,
    "Incident notification missing incident_id",
  );

  const ackRes = await authedRequest(
    captainToken,
    `/api/rides/${rideId}/live/incident/${incidentId}/ack`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  assert(ackRes.ok, `Incident ack failed with status ${ackRes.status}`);

  const ackData = (await ackRes.json()) as IncidentEnvelope;
  assert(
    ackData?.incident?.status === "acknowledged",
    "Incident was not acknowledged",
  );

  const endRes = await authedRequest(
    captainToken,
    `/api/rides/${rideId}/live/end`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: "integration test",
        mark_ride_completed: true,
      }),
    },
  );
  const endBody = await endRes.text();
  assert(
    endRes.ok,
    `End live session failed with status ${endRes.status}: ${endBody}`,
  );

  const endData = JSON.parse(endBody) as LiveSessionEnvelope;
  assert(endData?.session?.status === "ended", "Session did not end");

  await processLiveSessionEnded({
    rideId,
    actorRiderId: captain.id,
    reason: "integration test",
  });
  await processLiveSessionEnded({
    rideId,
    actorRiderId: captain.id,
    reason: "integration test",
  });

  const endedDedupeKey = `live_session_ended:${sessionId}`;
  const captainNotificationsAfterEnd = await getNotifications(captainToken);
  const participantNotificationsAfterEnd =
    await getNotifications(participantToken);
  const mutedNotificationsAfterEnd = await getNotifications(mutedToken);

  const participantEndedNotification = findNotificationByDedupeKey(
    participantNotificationsAfterEnd,
    "live_session_ended",
    endedDedupeKey,
  );
  const mutedEndedNotification = findNotificationByDedupeKey(
    mutedNotificationsAfterEnd,
    "live_session_ended",
    endedDedupeKey,
  );

  assert(
    countNotificationsByDedupeKey(
      captainNotificationsAfterEnd,
      "live_session_ended",
      endedDedupeKey,
    ) === 0,
    "Captain should not receive own live session ended notification",
  );
  assert(
    countNotificationsByDedupeKey(
      participantNotificationsAfterEnd,
      "live_session_ended",
      endedDedupeKey,
    ) === 1,
    "Live session ended notification dedupe failed for participant",
  );
  assert(
    countNotificationsByDedupeKey(
      mutedNotificationsAfterEnd,
      "live_session_ended",
      endedDedupeKey,
    ) === 1,
    "Live session ended notification missing for other confirmed participant",
  );
  assert(
    participantEndedNotification?.data?.reason === "integration test",
    "Ended notification missing reason metadata",
  );
  assert(
    participantEndedNotification?.body?.includes("integration test") === true,
    "Ended notification body missing reason",
  );
  assert(
    mutedEndedNotification?.data?.session_id === sessionId,
    "Ended notification missing session_id",
  );

  console.log("PASS: /api/live/health returned all true flags");
  console.log(
    "PASS: Phase 1 live session APIs work for start/session/end/incident/ack",
  );
  console.log(
    "PASS: Live notification processors respect preferences, exclude actors/reporters, and dedupe retries",
  );

  // ── 2FA / TOTP flow ──────────────────────────────────────────────────────
  const tfaToken = await registerAndLogin("tfa.test");

  const setupRes = await authedRequest(tfaToken, "/auth/2fa/setup", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert(setupRes.ok, `2FA setup failed with status ${setupRes.status}`);
  const setupData = (await setupRes.json()) as {
    secret?: string;
    otpauthUrl?: string;
  };
  assert(Boolean(setupData.secret), "2FA setup missing secret");
  assert(Boolean(setupData.otpauthUrl), "2FA setup missing otpauthUrl");
  assert(
    setupData.otpauthUrl?.startsWith("otpauth://"),
    "2FA otpauthUrl has wrong scheme",
  );

  // Verify with a bad token → 400
  const badVerifyRes = await authedRequest(tfaToken, "/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ token: "000000" }),
  });
  assert(
    badVerifyRes.status === 400,
    `Expected 400 for bad TOTP token, got ${badVerifyRes.status}`,
  );

  // Disable when not yet enabled → 400
  const prematureDisableRes = await authedRequest(
    tfaToken,
    "/auth/2fa/disable",
    { method: "POST", body: JSON.stringify({ password: TEST_PASSWORD, token: "000000" }) },
  );
  assert(
    prematureDisableRes.status === 400 || prematureDisableRes.status === 401,
    `Expected 400/401 for premature 2FA disable, got ${prematureDisableRes.status}`,
  );

  // Status endpoint reflects un-enrolled state
  const statusRes = await authedRequest(tfaToken, "/auth/2fa/status");
  assert(statusRes.ok, `2FA status failed with status ${statusRes.status}`);
  const statusData = (await statusRes.json()) as { enabled?: boolean };
  assert(
    statusData.enabled === false,
    "2FA status should be false before verification",
  );

  console.log("PASS: 2FA/TOTP setup → bad-verify 400 → premature-disable guard → status endpoint");

  // ── Security: login activity + sessions ──────────────────────────────────
  const secToken = await registerAndLogin("sec.test");

  const activityRes = await authedRequest(secToken, "/api/security/login-activity");
  assert(activityRes.ok, `GET /api/security/login-activity failed with status ${activityRes.status}`);
  const activityData = (await activityRes.json()) as { events?: unknown[] };
  assert(Array.isArray(activityData.events ?? activityData), "login-activity should return an array");

  const sessionsRes = await authedRequest(secToken, "/api/security/sessions");
  assert(sessionsRes.ok, `GET /api/security/sessions failed with status ${sessionsRes.status}`);
  const sessionsData = (await sessionsRes.json()) as { sessions?: unknown[] };
  assert(Array.isArray(sessionsData.sessions ?? sessionsData), "sessions should return an array");

  // DELETE all sessions → revokes current session (may return 200 or 401 on next call)
  const revokeAllRes = await authedRequest(secToken, "/api/security/sessions", {
    method: "DELETE",
  });
  assert(
    revokeAllRes.ok || revokeAllRes.status === 401,
    `DELETE /api/security/sessions unexpected status ${revokeAllRes.status}`,
  );

  console.log("PASS: GET /api/security/login-activity and sessions, DELETE /api/security/sessions");

  // DELETE individual session — use a fresh user to avoid self-revocation teardown
  const sec2Token = await registerAndLogin("sec2.test");
  const sess2Res = await authedRequest(sec2Token, "/api/security/sessions");
  const sess2Data = (await sess2Res.json()) as { sessions?: Array<{ id?: string }> };
  const sessionsList = sess2Data.sessions ?? (sess2Data as unknown as Array<{ id?: string }>);
  assert(Array.isArray(sessionsList), "sessions list is not an array");
  // Sessions list may be empty if the auth layer doesn't persist session rows
  if (Array.isArray(sessionsList) && sessionsList.length > 0) {
    const targetId = sessionsList[0]?.id;
    if (targetId) {
      const deleteOneRes = await authedRequest(
        sec2Token,
        `/api/security/sessions/${targetId}`,
        { method: "DELETE" },
      );
      assert(
        deleteOneRes.ok || deleteOneRes.status === 404,
        `DELETE /api/security/sessions/:id returned ${deleteOneRes.status}`,
      );
    }
  }

  console.log("PASS: DELETE /api/security/sessions/:id (or gracefully skipped when list empty)");

  // ── @Mention notifications ────────────────────────────────────────────────
  const now = Date.now();
  const mentionedUsername = `mentioneduser${now}`;

  // Register a rider with a known username
  const mentionedRegRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `mentioned.${now}@example.com`,
      password: TEST_PASSWORD,
      display_name: `Mentioned ${now}`,
      username: mentionedUsername,
    }),
  });
  assert(
    mentionedRegRes.ok,
    `Register mentioned user failed with status ${mentionedRegRes.status}`,
  );
  const mentionedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: `mentioned.${now}@example.com`,
      password: TEST_PASSWORD,
    }),
  });
  const mentionedLoginData = (await mentionedLoginRes.json()) as { token?: string };
  assert(Boolean(mentionedLoginData.token), "Mentioned user login token missing");
  const mentionedToken = mentionedLoginData.token as string;

  const authorToken = await registerAndLogin(`mention.author.${now}`);

  // Create a post that mentions the user
  const mentionPostRes = await authedRequest(authorToken, "/api/community/posts", {
    method: "POST",
    body: JSON.stringify({
      content: `Hey @${mentionedUsername}, check this out! #test`,
    }),
  });
  assert(
    mentionPostRes.ok,
    `Create mention post failed with status ${mentionPostRes.status}`,
  );

  // Allow async mention dispatch to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  const mentionedNotifications = await getNotifications(mentionedToken);
  const mentionNotif = mentionedNotifications.find(
    (n: NotificationItem) =>
      n.type === "mention" &&
      typeof n.data?.contentType === "string" &&
      n.data.contentType === "post",
  );
  assert(Boolean(mentionNotif), "Mentioned rider did not receive a mention notification");

  // Author should NOT receive mention notification for own post
  const authorNotifications = await getNotifications(authorToken);
  const selfMentionNotif = authorNotifications.find(
    (n: NotificationItem) => n.type === "mention",
  );
  assert(!selfMentionNotif, "Author should not receive mention notification for own content");

  console.log("PASS: @mention in post creates notification for mentioned rider, not for author");

  // ── Live timeline + replay ────────────────────────────────────────────────
  // The ride ended above (mark_ride_completed: true). Use rideId from existing session.
  const timelineRes = await authedRequest(captainToken, `/api/rides/${rideId}/live/timeline`);
  assert(
    timelineRes.ok,
    `GET /api/rides/:id/live/timeline failed with status ${timelineRes.status}`,
  );
  const timelineData = (await timelineRes.json()) as {
    events?: unknown[];
    timeline?: unknown[];
  };
  const timelineEvents = timelineData.events ?? timelineData.timeline ?? timelineData;
  assert(
    Array.isArray(timelineEvents),
    "Timeline response should be an array or have events/timeline array",
  );

  const replayRes = await authedRequest(
    captainToken,
    `/api/rides/${rideId}/live/replay`,
  );
  assert(
    replayRes.ok,
    `GET /api/rides/:id/live/replay failed with status ${replayRes.status}`,
  );
  const replayData = (await replayRes.json()) as {
    samples?: unknown[];
    data?: unknown[];
    items?: unknown[];
  };
  const replaySamples =
    replayData.samples ?? replayData.data ?? replayData.items ?? replayData;
  assert(
    Array.isArray(replaySamples),
    "Replay response should be an array or have samples/data/items array",
  );

  // Outsider should be denied timeline access
  const timelineOutsiderRes = await authedRequest(
    outsiderToken,
    `/api/rides/${rideId}/live/timeline`,
  );
  assert(
    timelineOutsiderRes.status === 403,
    `Expected 403 for outsider timeline, got ${timelineOutsiderRes.status}`,
  );

  console.log("PASS: GET /api/rides/:id/live/timeline and /replay return arrays; outsider blocked 403");

  // ── Support admin ─────────────────────────────────────────────────────────
  const riderForSupport = await registerAndLogin("support.rider");
  const adminUser = await registerAndLogin("support.admin");
  const adminProfile = await getMyProfile(adminUser);

  // Promote adminUser to is_admin via direct DB update
  await query("UPDATE riders SET is_admin = true WHERE id = $1", [
    adminProfile.id,
  ]);

  // Rider creates a support ticket
  const ticketRes = await authedRequest(riderForSupport, "/api/support", {
    method: "POST",
    body: JSON.stringify({
      subject: "Integration test issue",
      body: "Something went wrong in my ride.",
    }),
  });
  assert(
    ticketRes.ok,
    `Create support ticket failed with status ${ticketRes.status}`,
  );
  const ticketData = (await ticketRes.json()) as { ticket?: { id?: string } };
  const ticketId = ticketData.ticket?.id ?? (ticketData as unknown as { id?: string }).id;
  assert(Boolean(ticketId), "Support ticket ID missing from response");

  // Admin lists
  const adminTicketsRes = await authedRequest(
    adminUser,
    "/api/support/admin/tickets",
  );
  assert(
    adminTicketsRes.ok,
    `GET /api/support/admin/tickets failed with status ${adminTicketsRes.status}`,
  );
  const adminTicketsData = (await adminTicketsRes.json()) as {
    tickets?: unknown[];
  };
  const ticketsList = adminTicketsData.tickets ?? (adminTicketsData as unknown as unknown[]);
  assert(Array.isArray(ticketsList), "Admin tickets list should be an array");
TEST_PASSWORD
  // Non-admin cannot access admin route
  const nonAdminTicketsRes = await authedRequest(
    riderForSupport,
    "/api/support/admin/tickets",
  );
  assert(
    nonAdminTicketsRes.status === 403,
    `Expected 403 for non-admin tickets list, got ${nonAdminTicketsRes.status}`,
  );

  // Admin updates ticket status
  const patchRes = await authedRequest(
    adminUser,
    `/api/support/${ticketId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "in_progress",
        agent_reply: "We are investigating this issue.",
      }),
    },
  );
  assert(
    patchRes.ok,
    `PATCH /api/support/:id/status failed with status ${patchRes.status}`,
  );
  const patchData = (await patchRes.json()) as {
    ticket?: { status?: string };
    status?: string;
  };
  const updatedStatus =
    patchData.ticket?.status ?? (patchData as unknown as { status?: string }).status;
  assert(
    updatedStatus === "in_progress",
    `Expected ticket status 'in_progress', got '${updatedStatus}'`,
  );

  console.log(
    "PASS: Support admin — admin list tickets, PATCH status, non-admin 403",
  );

  // ── WebSocket ride events ─────────────────────────────────────────────────
  const wsRide = await (async () => {
    const wsToken = await registerAndLogin("ws.captain");
    const wsParticipantToken = await registerAndLogin("ws.participant");

    const createRes = await authedRequest(wsToken, "/api/rides", {
      method: "POST",
      body: JSON.stringify({
        title: `WS Test Ride ${Date.now()}`,
        visibility: "public",
        status: "scheduled",
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    assert(createRes.ok, `WS test: create ride failed with status ${createRes.status}`);
    const wsRideData = (await createRes.json()) as CreateRideResponse;
    return {
      rideId: wsRideData?.ride?.id as string,
      captainToken: wsToken,
      participantToken: wsParticipantToken,
    };
  })();

  const wsRideJoinedPromise = new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const socket = socketIoClient(`${BASE_URL}/rides`, {
        auth: { token: wsRide.captainToken },
        transports: ["websocket"],
      });

      const cleanup = (reason: string) => {
        socket.disconnect();
        reject(new Error(reason));
      };

      const timeout = setTimeout(
        () => cleanup("Timed out waiting for ride:joined event"),
        8000,
      );

      socket.once("connect", () => {
        socket.emit("ride:subscribe", { rideId: wsRide.rideId });
      });

      socket.once("ride:subscribed", () => {
        // Now have the participant join via REST — this should emit ride:joined
        authedRequest(wsRide.participantToken, `/api/rides/${wsRide.rideId}/join`, {
          method: "POST",
          body: JSON.stringify({}),
        }).catch((err: Error) => cleanup(`Join REST call failed: ${err.message}`));
      });

      socket.once("ride:joined", (payload: Record<string, unknown>) => {
        clearTimeout(timeout);
        socket.disconnect();
        resolve(payload);
      });

      socket.once("connect_error", (err: Error) =>
        cleanup(`Socket connect_error: ${err.message}`),
      );
    },
  );

  const joinedPayload = await wsRideJoinedPromise;
  assert(
    joinedPayload?.rideId === wsRide.rideId,
    `ride:joined payload missing or wrong rideId: ${JSON.stringify(joinedPayload)}`,
  );

  console.log("PASS: WebSocket ride:joined event received after POST /api/rides/:id/join");
  console.log(
    "PASS: Live location guards reject stale/future/out-of-order packets without mutating participant heartbeat",
  );
};

run().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
