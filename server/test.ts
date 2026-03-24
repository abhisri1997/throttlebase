/// <reference types="node" />

import { processLiveIncidentReported } from "./src/workers/processors/live-notification.processor.js";
import {
  processLiveSessionEnded,
  processLiveSessionStarted,
} from "./src/workers/processors/live-session.processor.js";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5001";

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
  const password = "Passw0rd123";

  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      display_name: `${label} ${now}`,
    }),
  });
  assert(registerRes.ok, `Register failed with status ${registerRes.status}`);

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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
};

run().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
