import pool, { query } from "../config/db.js";
import {
  enqueueLiveIncidentReported,
  enqueueLiveSessionEnded,
  enqueueLiveSessionStarted,
} from "./jobs.service.js";
import type {
  CreateIncidentInput,
  LiveLocationUpdateInput,
} from "../schemas/live-session.schemas.js";

export class LiveSessionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

type RideContext = {
  ride_id: string;
  ride_status: string;
  captain_id: string;
  caller_role: "captain" | "co_captain" | "member" | null;
  is_confirmed_participant: boolean;
};

type LiveSessionSummary = {
  id: string;
  ride_id: string;
  status: "starting" | "active" | "paused" | "ended";
  started_by: string | null;
  started_at: string | null;
  ended_by: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  created_at: string;
  updated_at: string;
  participants: Array<{
    rider_id: string;
    display_name: string;
    role: "captain" | "co_captain" | "member";
    is_online: boolean;
    last_heartbeat_at: string | null;
  }>;
};

const DEFAULT_MAX_LOCATION_AGE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_LOCATION_FUTURE_SKEW_MS = 30 * 1000;
const DEFAULT_OUT_OF_ORDER_GRACE_MS = 15 * 1000;

const LOCATION_MAX_AGE_MS = Number.parseInt(
  process.env.LIVE_LOCATION_MAX_AGE_MS || `${DEFAULT_MAX_LOCATION_AGE_MS}`,
  10,
);
const LOCATION_MAX_FUTURE_SKEW_MS = Number.parseInt(
  process.env.LIVE_LOCATION_MAX_FUTURE_SKEW_MS ||
    `${DEFAULT_MAX_LOCATION_FUTURE_SKEW_MS}`,
  10,
);
const LOCATION_OUT_OF_ORDER_GRACE_MS = Number.parseInt(
  process.env.LIVE_LOCATION_OUT_OF_ORDER_GRACE_MS ||
    `${DEFAULT_OUT_OF_ORDER_GRACE_MS}`,
  10,
);

type LiveLocationDropReason = "stale" | "future_skew" | "out_of_order";

type LiveLocationDropTelemetry = {
  enabled: boolean;
  total_dropped: number;
  stale: number;
  future_skew: number;
  out_of_order: number;
  last_dropped_at: string | null;
};

const LIVE_LOCATION_DROP_TELEMETRY_ENABLED =
  process.env.LIVE_LOCATION_DROP_TELEMETRY === "true";

const liveLocationDropTelemetry: LiveLocationDropTelemetry = {
  enabled: LIVE_LOCATION_DROP_TELEMETRY_ENABLED,
  total_dropped: 0,
  stale: 0,
  future_skew: 0,
  out_of_order: 0,
  last_dropped_at: null,
};

const recordLiveLocationDrop = (reason: LiveLocationDropReason) => {
  if (!LIVE_LOCATION_DROP_TELEMETRY_ENABLED) {
    return;
  }

  liveLocationDropTelemetry.total_dropped += 1;
  liveLocationDropTelemetry.last_dropped_at = new Date().toISOString();

  if (reason === "stale") {
    liveLocationDropTelemetry.stale += 1;
    return;
  }

  if (reason === "future_skew") {
    liveLocationDropTelemetry.future_skew += 1;
    return;
  }

  liveLocationDropTelemetry.out_of_order += 1;
};

export const getLiveLocationDropTelemetry = (): LiveLocationDropTelemetry => ({
  ...liveLocationDropTelemetry,
});

const normalizePresenceRole = (
  role: string,
): "captain" | "co_captain" | "member" => {
  if (role === "captain") return "captain";
  if (role === "co_captain") return "co_captain";
  return "member";
};

const getRideContext = async (
  client: { query: (text: string, params?: any[]) => Promise<any> },
  rideId: string,
  riderId: string,
): Promise<RideContext> => {
  const result = await client.query(
    `SELECT r.id AS ride_id,
            r.status AS ride_status,
            r.captain_id,
            CASE
              WHEN r.captain_id = $2 THEN 'captain'
              WHEN EXISTS (
                SELECT 1
                FROM ride_participants rp
                WHERE rp.ride_id = r.id
                  AND rp.rider_id = $2
                  AND rp.status = 'confirmed'
                  AND rp.role = 'co_captain'
              ) THEN 'co_captain'
              WHEN EXISTS (
                SELECT 1
                FROM ride_participants rp
                WHERE rp.ride_id = r.id
                  AND rp.rider_id = $2
                  AND rp.status = 'confirmed'
              ) THEN 'member'
              ELSE NULL
            END AS caller_role,
            (
              r.captain_id = $2 OR EXISTS (
                SELECT 1
                FROM ride_participants rp
                WHERE rp.ride_id = r.id
                  AND rp.rider_id = $2
                  AND rp.status = 'confirmed'
              )
            ) AS is_confirmed_participant
     FROM rides r
     WHERE r.id = $1
     FOR UPDATE`,
    [rideId, riderId],
  );

  if (!result.rows.length) {
    throw new LiveSessionError("Ride not found", 404);
  }

  return result.rows[0] as RideContext;
};

const requireCaptainOrCoCaptain = (ctx: RideContext) => {
  if (ctx.caller_role !== "captain" && ctx.caller_role !== "co_captain") {
    throw new LiveSessionError(
      "Only captain or co-captain can perform this action",
      403,
    );
  }
};

const requireConfirmedParticipant = (ctx: RideContext) => {
  if (!ctx.is_confirmed_participant) {
    throw new LiveSessionError(
      "Only confirmed participants can access live session",
      403,
    );
  }
};

const getLiveSessionByRide = async (
  client: { query: (text: string, params?: any[]) => Promise<any> },
  rideId: string,
) => {
  const result = await client.query(
    `SELECT id, ride_id, status, started_by, started_at, ended_by, ended_at, ended_reason, created_at, updated_at
     FROM ride_live_sessions
     WHERE ride_id = $1
     FOR UPDATE`,
    [rideId],
  );

  return result.rows[0] ?? null;
};

const getLiveSessionWithParticipants = async (
  rideId: string,
): Promise<LiveSessionSummary | null> => {
  const result = await query(
    `SELECT s.id,
            s.ride_id,
            s.status,
            s.started_by,
            s.started_at,
            s.ended_by,
            s.ended_at,
            s.ended_reason,
            s.created_at,
            s.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'rider_id', p.rider_id,
                  'display_name', r.display_name,
                  'role', p.role,
                  'is_online', p.is_online,
                  'last_heartbeat_at', p.last_heartbeat_at
                )
                ORDER BY r.display_name ASC
              ) FILTER (WHERE p.rider_id IS NOT NULL),
              '[]'::json
            ) AS participants
     FROM ride_live_sessions s
     LEFT JOIN ride_live_presence p ON p.session_id = s.id
     LEFT JOIN riders r ON r.id = p.rider_id
     WHERE s.ride_id = $1
     GROUP BY s.id`,
    [rideId],
  );

  if (!result.rows.length) {
    return null;
  }

  return result.rows[0] as LiveSessionSummary;
};

export const getLiveSessionFoundationStatus = async () => {
  const result = await query(
    `SELECT
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_live_sessions') AS has_sessions,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_live_presence') AS has_presence,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_live_events') AS has_events,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_live_location_samples') AS has_samples,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_live_incidents') AS has_incidents`,
  );

  return result.rows[0] as {
    has_sessions: boolean;
    has_presence: boolean;
    has_events: boolean;
    has_samples: boolean;
    has_incidents: boolean;
  };
};

export const startLiveSession = async (rideId: string, riderId: string) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireCaptainOrCoCaptain(ctx);

    if (!["scheduled", "active"].includes(ctx.ride_status)) {
      throw new LiveSessionError(
        `Cannot start live session for ride status \"${ctx.ride_status}\"`,
        400,
      );
    }

    if (ctx.ride_status === "scheduled") {
      await client.query(
        `UPDATE rides SET status = 'active', updated_at = now() WHERE id = $1`,
        [rideId],
      );
    }

    const existingSession = await getLiveSessionByRide(client, rideId);

    let sessionId: string;
    let createdOrReopened = false;

    if (!existingSession) {
      const insert = await client.query(
        `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at, created_at, updated_at)
         VALUES ($1, 'active', $2, now(), now(), now())
         RETURNING id`,
        [rideId, riderId],
      );
      sessionId = insert.rows[0].id as string;
      createdOrReopened = true;
    } else if (existingSession.status === "ended") {
      const reopen = await client.query(
        `UPDATE ride_live_sessions
         SET status = 'active',
             started_by = $2,
             started_at = now(),
             ended_by = NULL,
             ended_at = NULL,
             ended_reason = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [existingSession.id, riderId],
      );
      sessionId = reopen.rows[0].id as string;
      createdOrReopened = true;
    } else {
      sessionId = existingSession.id as string;
    }

    await client.query(
      `INSERT INTO ride_live_presence (session_id, rider_id, role, is_online, created_at, updated_at)
       SELECT $2,
              riders.rider_id,
              CASE
                WHEN riders.role = 'captain' THEN 'captain'
                WHEN riders.role = 'co_captain' THEN 'co_captain'
                ELSE 'member'
              END,
              false,
              now(),
              now()
       FROM (
         SELECT r.captain_id AS rider_id, 'captain'::text AS role
         FROM rides r
         WHERE r.id = $1
         UNION
         SELECT rp.rider_id, rp.role::text
         FROM ride_participants rp
         WHERE rp.ride_id = $1
           AND rp.status = 'confirmed'
       ) riders
       ON CONFLICT (session_id, rider_id)
       DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
      [rideId, sessionId],
    );

    if (createdOrReopened) {
      await client.query(
        `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
         VALUES ($1, $2, 'session_started', jsonb_build_object('source', 'api'))`,
        [sessionId, riderId],
      );
    }

    await client.query("COMMIT");

    if (createdOrReopened) {
      try {
        await enqueueLiveSessionStarted(rideId, riderId);
      } catch (queueError) {
        console.error(
          "Failed to enqueue live_session.started job:",
          queueError,
        );
      }
    }

    const session = await getLiveSessionWithParticipants(rideId);
    return {
      started: createdOrReopened,
      session,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getLiveSession = async (rideId: string, riderId: string) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const session = await getLiveSessionWithParticipants(rideId);
  if (!session) {
    throw new LiveSessionError("Live session not found", 404);
  }

  return session;
};

export const endLiveSession = async (
  rideId: string,
  riderId: string,
  options?: { reason?: string; mark_ride_completed?: boolean },
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireCaptainOrCoCaptain(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session) {
      throw new LiveSessionError("Live session not found", 404);
    }

    if (session.status !== "ended") {
      await client.query(
        `UPDATE ride_live_sessions
         SET status = 'ended',
             ended_by = $2,
             ended_at = now(),
           ended_reason = COALESCE($3::text, ended_reason),
             updated_at = now()
         WHERE id = $1`,
        [session.id, riderId, options?.reason || null],
      );

      await client.query(
        `UPDATE ride_live_presence
         SET is_online = false,
             updated_at = now()
         WHERE session_id = $1`,
        [session.id],
      );

      await client.query(
        `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
         VALUES ($1, $2, 'session_ended', jsonb_build_object('reason', $3::text))`,
        [session.id, riderId, options?.reason || null],
      );
    }

    if (options?.mark_ride_completed && ctx.ride_status === "active") {
      await client.query(
        `UPDATE rides SET status = 'completed', updated_at = now() WHERE id = $1`,
        [rideId],
      );
    }

    await client.query("COMMIT");

    if (session.status !== "ended") {
      try {
        await enqueueLiveSessionEnded(rideId, riderId, options?.reason);
      } catch (queueError) {
        console.error("Failed to enqueue live_session.ended job:", queueError);
      }
    }

    const updatedSession = await getLiveSessionWithParticipants(rideId);
    return {
      ended: session.status !== "ended",
      session: updatedSession,
      mark_ride_completed: Boolean(options?.mark_ride_completed),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const createLiveIncident = async (
  rideId: string,
  riderId: string,
  input: CreateIncidentInput,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session) {
      throw new LiveSessionError("Live session not found", 404);
    }

    if (!["starting", "active", "paused"].includes(session.status)) {
      throw new LiveSessionError(
        "Cannot report incident for an ended session",
        400,
      );
    }

    const incidentInsert =
      input.lon !== undefined && input.lat !== undefined
        ? await client.query(
            `INSERT INTO ride_live_incidents (
               session_id, rider_id, severity, kind, location, metadata
             )
             VALUES (
               $1,
               $2,
               $3,
               $4,
               ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
               $7::jsonb
             )
             RETURNING *`,
            [
              session.id,
              riderId,
              input.severity,
              input.kind,
              input.lon,
              input.lat,
              JSON.stringify(input.metadata || {}),
            ],
          )
        : await client.query(
            `INSERT INTO ride_live_incidents (
               session_id, rider_id, severity, kind, metadata
             )
             VALUES ($1, $2, $3, $4, $5::jsonb)
             RETURNING *`,
            [
              session.id,
              riderId,
              input.severity,
              input.kind,
              JSON.stringify(input.metadata || {}),
            ],
          );

    const incident = incidentInsert.rows[0];

    await client.query(
      `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
       VALUES ($1, $2, 'incident_reported', $3::jsonb)`,
      [
        session.id,
        riderId,
        JSON.stringify({
          incident_id: incident.id,
          severity: incident.severity,
          kind: incident.kind,
          status: incident.status,
        }),
      ],
    );

    await client.query("COMMIT");

    try {
      await enqueueLiveIncidentReported(
        incident.id as string,
        rideId,
        incident.severity as string,
        riderId,
      );
    } catch (queueError) {
      console.error(
        "Failed to enqueue live_session.incident_reported job:",
        queueError,
      );
    }

    return incident;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const acknowledgeLiveIncident = async (
  rideId: string,
  incidentId: string,
  riderId: string,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireCaptainOrCoCaptain(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session) {
      throw new LiveSessionError("Live session not found", 404);
    }

    const updateResult = await client.query(
      `UPDATE ride_live_incidents
       SET status = 'acknowledged',
           acknowledged_at = now(),
           acknowledged_by = $3
       WHERE id = $1
         AND session_id = $2
         AND status = 'open'
       RETURNING *`,
      [incidentId, session.id, riderId],
    );

    let incident = updateResult.rows[0] || null;

    if (!incident) {
      const existing = await client.query(
        `SELECT *
         FROM ride_live_incidents
         WHERE id = $1
           AND session_id = $2`,
        [incidentId, session.id],
      );

      if (!existing.rows.length) {
        throw new LiveSessionError("Incident not found", 404);
      }

      incident = existing.rows[0];
    } else {
      await client.query(
        `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
         VALUES ($1, $2, 'incident_acknowledged', $3::jsonb)`,
        [
          session.id,
          riderId,
          JSON.stringify({ incident_id: incident.id, status: incident.status }),
        ],
      );
    }

    await client.query("COMMIT");
    return incident;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateLivePresenceHeartbeat = async (
  rideId: string,
  riderId: string,
  heartbeatAt?: string,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session) {
      throw new LiveSessionError("Live session not found", 404);
    }

    if (!["starting", "active", "paused"].includes(session.status as string)) {
      throw new LiveSessionError(
        "Cannot update presence for an ended session",
        400,
      );
    }

    const timestamp = heartbeatAt ?? new Date().toISOString();
    const role = normalizePresenceRole(ctx.caller_role ?? "member");

    await client.query(
      `INSERT INTO ride_live_presence (session_id, rider_id, role, is_online, last_heartbeat_at, updated_at)
       VALUES ($1, $2, $3, true, $4::timestamptz, now())
       ON CONFLICT (session_id, rider_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         is_online = true,
         last_heartbeat_at = EXCLUDED.last_heartbeat_at,
         updated_at = now()`,
      [session.id, riderId, role, timestamp],
    );

    await client.query("COMMIT");

    return {
      sessionId: session.id as string,
      riderId,
      isOnline: true,
      lastHeartbeatAt: timestamp,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const markLivePresenceOffline = async (
  rideId: string,
  riderId: string,
  offlineAt?: string,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session) {
      throw new LiveSessionError("Live session not found", 404);
    }

    const timestamp = offlineAt ?? new Date().toISOString();

    await client.query(
      `UPDATE ride_live_presence
       SET is_online = false,
           last_heartbeat_at = COALESCE($3::timestamptz, last_heartbeat_at),
           updated_at = now()
       WHERE session_id = $1
         AND rider_id = $2`,
      [session.id, riderId, timestamp],
    );

    await client.query("COMMIT");

    return {
      sessionId: session.id as string,
      riderId,
      isOnline: false,
      lastHeartbeatAt: timestamp,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateLivePresenceLocation = async (
  rideId: string,
  riderId: string,
  input: LiveLocationUpdateInput,
  options?: { persistSample?: boolean },
): Promise<{
  sessionId: string;
  riderId: string;
  lon: number;
  lat: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  capturedAt: string;
} | null> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session) {
      throw new LiveSessionError("Live session not found", 404);
    }

    if (!["starting", "active", "paused"].includes(session.status as string)) {
      throw new LiveSessionError(
        "Cannot update location for an ended session",
        400,
      );
    }

    const capturedAt = input.captured_at ?? new Date().toISOString();
    const capturedAtMs = Date.parse(capturedAt);
    const nowMs = Date.now();

    if (
      Number.isFinite(capturedAtMs) &&
      nowMs - capturedAtMs > LOCATION_MAX_AGE_MS
    ) {
      recordLiveLocationDrop("stale");
      await client.query("ROLLBACK");
      return null;
    }

    if (
      Number.isFinite(capturedAtMs) &&
      capturedAtMs - nowMs > LOCATION_MAX_FUTURE_SKEW_MS
    ) {
      recordLiveLocationDrop("future_skew");
      await client.query("ROLLBACK");
      return null;
    }

    const role = normalizePresenceRole(ctx.caller_role ?? "member");

    const latestPresence = await client.query(
      `SELECT last_heartbeat_at
       FROM ride_live_presence
       WHERE session_id = $1
         AND rider_id = $2
       FOR UPDATE`,
      [session.id, riderId],
    );

    const previousTimestamp = latestPresence.rows[0]?.last_heartbeat_at as
      | string
      | null
      | undefined;
    const previousMs = previousTimestamp ? Date.parse(previousTimestamp) : NaN;

    if (
      Number.isFinite(capturedAtMs) &&
      Number.isFinite(previousMs) &&
      capturedAtMs + LOCATION_OUT_OF_ORDER_GRACE_MS < previousMs
    ) {
      recordLiveLocationDrop("out_of_order");
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `INSERT INTO ride_live_presence (
         session_id,
         rider_id,
         role,
         is_online,
         last_heartbeat_at,
         last_location,
         updated_at
       )
       VALUES (
         $1,
         $2,
         $3,
         true,
         $4::timestamptz,
         ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
         now()
       )
       ON CONFLICT (session_id, rider_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         is_online = true,
         last_heartbeat_at = EXCLUDED.last_heartbeat_at,
         last_location = EXCLUDED.last_location,
         updated_at = now()`,
      [session.id, riderId, role, capturedAt, input.lon, input.lat],
    );

    if (options?.persistSample) {
      await client.query(
        `INSERT INTO ride_live_location_samples (
           session_id,
           rider_id,
           location,
           speed_kmh,
           heading_deg,
           accuracy_m,
           captured_at
         )
         VALUES (
           $1,
           $2,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
           $5,
           $6,
           $7,
           $8::timestamptz
         )`,
        [
          session.id,
          riderId,
          input.lon,
          input.lat,
          input.speed_kmh ?? null,
          input.heading_deg ?? null,
          input.accuracy_m ?? null,
          capturedAt,
        ],
      );
    }

    await client.query("COMMIT");

    return {
      sessionId: session.id as string,
      riderId,
      lon: input.lon,
      lat: input.lat,
      speedKmh: input.speed_kmh ?? null,
      headingDeg: input.heading_deg ?? null,
      accuracyM: input.accuracy_m ?? null,
      capturedAt,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE — ordered event stream for a completed (or any) live session
// ═══════════════════════════════════════════════════════════════════════════════

export const getLiveSessionTimeline = async (
  rideId: string,
  callerId: string,
): Promise<{
  session: { id: string; ride_id: string; status: string; started_at: string | null; ended_at: string | null };
  events: Array<{
    id: string;
    event_type: string;
    actor_rider_id: string | null;
    actor_display_name: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
}> => {
  // Verify the ride exists and the caller is a confirmed participant
  const rideCheck = await query(
    `SELECT r.id,
            (
              r.captain_id = $2 OR EXISTS (
                SELECT 1 FROM ride_participants rp
                WHERE rp.ride_id = r.id
                  AND rp.rider_id = $2
                  AND rp.status = 'confirmed'
              )
            ) AS is_participant
     FROM rides r
     WHERE r.id = $1`,
    [rideId, callerId],
  );

  if (!rideCheck.rows.length) {
    throw new LiveSessionError("Ride not found", 404);
  }
  if (!rideCheck.rows[0].is_participant) {
    throw new LiveSessionError("Only confirmed participants can view the timeline", 403);
  }

  const sessionResult = await query(
    `SELECT id, ride_id, status, started_at, ended_at
     FROM ride_live_sessions
     WHERE ride_id = $1`,
    [rideId],
  );

  if (!sessionResult.rows.length) {
    throw new LiveSessionError("No live session found for this ride", 404);
  }

  const session = sessionResult.rows[0] as {
    id: string;
    ride_id: string;
    status: string;
    started_at: string | null;
    ended_at: string | null;
  };

  const eventsResult = await query(
    `SELECT e.id::text,
            e.event_type,
            e.actor_rider_id::text,
            r.display_name AS actor_display_name,
            e.payload,
            e.created_at
     FROM ride_live_events e
     LEFT JOIN riders r ON r.id = e.actor_rider_id
     WHERE e.session_id = $1
     ORDER BY e.created_at ASC, e.id ASC`,
    [session.id],
  );

  const events = eventsResult.rows.map((row) => ({
    id: row.id as string,
    event_type: row.event_type as string,
    actor_rider_id: (row.actor_rider_id as string | null) ?? null,
    actor_display_name: (row.actor_display_name as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  }));

  return { session, events };
};

// ═══════════════════════════════════════════════════════════════════════════════
// REPLAY — paginated location samples for map playback
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReplayOptions {
  limit?: number;
  cursor?: number; // last seen sample id (BIGINT, used as opaque cursor)
  fromTs?: string; // ISO timestamp lower bound (captured_at >= fromTs)
  toTs?: string;   // ISO timestamp upper bound (captured_at <= toTs)
}

export const getLiveSessionReplay = async (
  rideId: string,
  callerId: string,
  opts: ReplayOptions = {},
): Promise<{
  session: { id: string; ride_id: string; status: string; started_at: string | null };
  samples: Array<{
    id: string;
    rider_id: string;
    display_name: string | null;
    lon: number;
    lat: number;
    speed_kmh: number | null;
    heading_deg: number | null;
    accuracy_m: number | null;
    captured_at: string;
  }>;
  next_cursor: string | null;
}> => {
  // Verify participation
  const rideCheck = await query(
    `SELECT r.id,
            (
              r.captain_id = $2 OR EXISTS (
                SELECT 1 FROM ride_participants rp
                WHERE rp.ride_id = r.id
                  AND rp.rider_id = $2
                  AND rp.status = 'confirmed'
              )
            ) AS is_participant
     FROM rides r
     WHERE r.id = $1`,
    [rideId, callerId],
  );

  if (!rideCheck.rows.length) {
    throw new LiveSessionError("Ride not found", 404);
  }
  if (!rideCheck.rows[0].is_participant) {
    throw new LiveSessionError("Only confirmed participants can access replay", 403);
  }

  const sessionResult = await query(
    `SELECT id, ride_id, status, started_at
     FROM ride_live_sessions
     WHERE ride_id = $1`,
    [rideId],
  );

  if (!sessionResult.rows.length) {
    throw new LiveSessionError("No live session found for this ride", 404);
  }

  const session = sessionResult.rows[0] as {
    id: string;
    ride_id: string;
    status: string;
    started_at: string | null;
  };

  const limit = Math.min(opts.limit ?? 200, 500);
  const params: unknown[] = [session.id, limit + 1]; // +1 to detect next page
  const conditions: string[] = ["s.session_id = $1"];
  let pidx = 3;

  if (opts.cursor) {
    conditions.push(`s.id > $${pidx++}`);
    params.push(opts.cursor);
  }
  if (opts.fromTs) {
    conditions.push(`s.captured_at >= $${pidx++}`);
    params.push(opts.fromTs);
  }
  if (opts.toTs) {
    conditions.push(`s.captured_at <= $${pidx++}`);
    params.push(opts.toTs);
  }

  const samplesResult = await query(
    `SELECT s.id,
            s.rider_id,
            r.display_name,
            ST_X(s.location::geometry) AS lon,
            ST_Y(s.location::geometry) AS lat,
            s.speed_kmh,
            s.heading_deg,
            s.accuracy_m,
            s.captured_at
     FROM ride_live_location_samples s
     LEFT JOIN riders r ON r.id = s.rider_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.captured_at ASC, s.id ASC
     LIMIT $2`,
    params,
  );

  const rows = samplesResult.rows;
  const hasMore = rows.length === limit + 1;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(pageRows[pageRows.length - 1]!.id) : null;

  const samples = pageRows.map((row) => ({
    id: String(row.id),
    rider_id: row.rider_id as string,
    display_name: (row.display_name as string | null) ?? null,
    lon: Number(row.lon),
    lat: Number(row.lat),
    speed_kmh: row.speed_kmh != null ? Number(row.speed_kmh) : null,
    heading_deg: row.heading_deg != null ? Number(row.heading_deg) : null,
    accuracy_m: row.accuracy_m != null ? Number(row.accuracy_m) : null,
    captured_at: row.captured_at as string,
  }));

  return { session, samples, next_cursor: nextCursor };
};
