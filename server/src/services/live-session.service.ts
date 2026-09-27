import pool, { query } from "../config/db.js";
import {
  enqueueLiveIncidentReported,
  enqueueLiveSessionEnded,
  enqueueRideStatsRecompute,
  enqueueLiveSessionStarted,
} from "./jobs.service.js";
import type {
  CreateIncidentInput,
  LiveLocationUpdateInput,
} from "../schemas/live-session.schemas.js";
import {
  nextArrivalState,
  type ArrivalTransition,
} from "../core/ride-progress/arrival.js";
import { RIDE_PROGRESS_CONFIG } from "../core/ride-progress/config.js";
import {
  classifyGroupEndFinish,
  deriveRiderProgress,
  type FinishReason,
  type RiderProgress,
} from "../core/ride-progress/progress.js";
import {
  toFinishPosition,
  finishRemainingRiders,
  listRidingRiders,
  lockRiderProgress,
  markPresentRidersStarted,
  markRiderStarted,
  resetSessionProgress,
  updateArrivalState,
  type SqlClient,
} from "./ride-progress.repository.js";

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
    progress: RiderProgress;
    ride_started_at: string | null;
    finished_at: string | null;
    finish_reason: FinishReason | null;
    arrived_at: string | null;
    distance_to_destination_m: number | null;
  }>;
};

/** Ending the ride would cut short riders who are still out; the caller must confirm. */
export class UnfinishedRidersError extends LiveSessionError {
  riders: Array<{
    rider_id: string;
    display_name: string | null;
    is_online: boolean;
    last_heartbeat_at: string | null;
    distance_to_destination_m: number | null;
  }>;

  constructor(riders: UnfinishedRidersError["riders"]) {
    super(
      `${riders.length} rider${riders.length === 1 ? " has" : "s have"} not reached the destination`,
      409,
    );
    this.riders = riders;
  }
}

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

export const getRideContext = async (
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

export const requireConfirmedParticipant = (ctx: RideContext) => {
  if (!ctx.is_confirmed_participant) {
    throw new LiveSessionError(
      "Only confirmed participants can access live session",
      403,
    );
  }
};

export const getLiveSessionByRide = async (
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

type ParticipantRow = Omit<LiveSessionSummary["participants"][number], "progress">;

export const getLiveSessionWithParticipants = async (
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
                  'last_heartbeat_at', p.last_heartbeat_at,
                  'ride_started_at', p.ride_started_at,
                  'finished_at', p.finished_at,
                  'finish_reason', p.finish_reason,
                  'arrived_at', p.arrived_at,
                  'distance_to_destination_m',
                    round(ST_Distance(COALESCE(p.finish_location, p.last_location), ride.end_point)::numeric)
                )
                ORDER BY r.display_name ASC
              ) FILTER (WHERE p.rider_id IS NOT NULL),
              '[]'::json
            ) AS participants
     FROM ride_live_sessions s
     JOIN rides ride ON ride.id = s.ride_id
     LEFT JOIN ride_live_presence p ON p.session_id = s.id
     LEFT JOIN riders r ON r.id = p.rider_id
     WHERE s.ride_id = $1
     GROUP BY s.id`,
    [rideId],
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    participants: (row.participants as ParticipantRow[]).map((participant) => ({
      ...participant,
      distance_to_destination_m:
        participant.distance_to_destination_m === null
          ? null
          : Number(participant.distance_to_destination_m),
      progress: deriveRiderProgress({
        rideStartedAt: participant.ride_started_at,
        finishedAt: participant.finished_at,
        finishReason: participant.finish_reason,
      }),
    })),
  } as LiveSessionSummary;
};

/** Every confirmed rider gets a presence row, so the roster shows who has not turned up. */
export const seedSessionPresence = async (
  client: SqlClient,
  rideId: string,
  sessionId: string,
): Promise<void> => {
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
        `Cannot start live session for ride status "${ctx.ride_status}"`,
        400,
      );
    }

    // The ride itself only becomes active on roll-out. Starting opens the
    // session so riders join and report where they are, which is what gives
    // the captain a roll call before the group actually sets off.

    const existingSession = await getLiveSessionByRide(client, rideId);

    let sessionId: string;
    let createdOrReopened = false;

    if (!existingSession) {
      const insert = await client.query(
        `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at, created_at, updated_at)
         VALUES ($1, 'starting', $2, now(), now(), now())
         RETURNING id`,
        [rideId, riderId],
      );
      sessionId = insert.rows[0].id as string;
      createdOrReopened = true;
    } else if (existingSession.status === "ended") {
      const reopen = await client.query(
        `UPDATE ride_live_sessions
         SET status = 'starting',
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
      await resetSessionProgress(client, sessionId);
    } else {
      // Already open — possibly by a rider who started their own ride early.
      // The captain starting it now is the roll call, as it always was.
      sessionId = existingSession.id as string;
    }

    await seedSessionPresence(client, rideId, sessionId);

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

interface CloseSessionInput {
  rideId: string;
  session: { id: string; status: string };
  rideStatus: string;
  /** Null when the system closes the ride — everyone finished, or it went idle. */
  actorRiderId: string | null;
  reason: string | null;
  markRideCompleted: boolean;
}

interface CloseSessionOutcome {
  ended: boolean;
  markedRideCompleted: boolean;
  finishedRiderCount: number;
}

const countStartedRiders = async (client: SqlClient, sessionId: string): Promise<number> => {
  const result = await client.query(
    `SELECT count(*)::int AS started
     FROM ride_live_presence
     WHERE session_id = $1 AND ride_started_at IS NOT NULL`,
    [sessionId],
  );
  return (result.rows[0]?.started as number | undefined) ?? 0;
};

/**
 * Ends the group ride inside the caller's transaction: closes the session,
 * finishes everyone still riding and, when asked, completes the ride. A ride
 * still "scheduled" completes too if anyone rode it — riders who started early
 * before the captain ever rolled out.
 */
const closeSessionInTransaction = async (
  client: SqlClient,
  input: CloseSessionInput,
): Promise<CloseSessionOutcome> => {
  const isOpen = input.session.status !== "ended";
  let finishedRiderCount = 0;

  if (isOpen) {
    await client.query(
      `UPDATE ride_live_sessions
       SET status = 'ended',
           ended_by = $2,
           ended_at = now(),
           ended_reason = COALESCE($3::text, ended_reason),
           updated_at = now()
       WHERE id = $1`,
      [input.session.id, input.actorRiderId, input.reason],
    );

    const finished = await finishRemainingRiders(
      client,
      input.session.id,
      RIDE_PROGRESS_CONFIG.arrival.arriveRadiusM,
    );
    finishedRiderCount = finished.length;

    await client.query(
      `UPDATE ride_live_presence
       SET is_online = false,
           updated_at = now()
       WHERE session_id = $1`,
      [input.session.id],
    );

    await client.query(
      `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
       VALUES ($1, $2, 'session_ended', jsonb_build_object('reason', $3::text))`,
      [input.session.id, input.actorRiderId, input.reason],
    );
  }

  const isCompletable =
    input.rideStatus === "active" ||
    (input.rideStatus === "scheduled" && (await countStartedRiders(client, input.session.id)) > 0);
  const markedRideCompleted = input.markRideCompleted && isCompletable;

  if (markedRideCompleted) {
    await client.query(
      `UPDATE rides SET status = 'completed', updated_at = now() WHERE id = $1`,
      [input.rideId],
    );
  }

  return { ended: isOpen, markedRideCompleted, finishedRiderCount };
};

/** Work that must follow a committed close: stats for everyone who rode, and the ended job. */
const afterSessionClosed = async (
  rideId: string,
  actorRiderId: string | null,
  reason: string | null,
  outcome: CloseSessionOutcome,
): Promise<void> => {
  // Ending the session is how a ride actually completes, so this is where the
  // track becomes history stats. Editing a ride to "completed" has its own
  // enqueue; both go through the same de-duplicated job.
  if (outcome.markedRideCompleted || outcome.finishedRiderCount > 0) {
    try {
      await enqueueRideStatsRecompute(rideId, "ride-completed");
    } catch (queueError) {
      console.error("Failed to enqueue ride stats recompute job:", queueError);
    }
  }

  if (outcome.ended) {
    try {
      await enqueueLiveSessionEnded(rideId, actorRiderId, reason ?? undefined);
    } catch (queueError) {
      console.error("Failed to enqueue live_session.ended job:", queueError);
    }
  }
};

/** Arrived riders are finished as such by the end; only riders still out need confirming. */
const isStillOut = (rider: Parameters<typeof toFinishPosition>[0]): boolean =>
  classifyGroupEndFinish(toFinishPosition(rider), RIDE_PROGRESS_CONFIG.arrival.arriveRadiusM) !==
  "arrived";

export const endLiveSession = async (
  rideId: string,
  riderId: string,
  options?: { reason?: string; mark_ride_completed?: boolean; confirm_unfinished?: boolean },
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

    // Riders still out would have their ride cut short; the captain has to
    // see who they are before ending it anyway. Riders already at the
    // destination are simply marked arrived.
    if (session.status !== "ended" && !options?.confirm_unfinished) {
      const stillOut = (await listRidingRiders(client, session.id)).filter(isStillOut);

      if (stillOut.length > 0) {
        throw new UnfinishedRidersError(
          stillOut.map((rider) => ({
            rider_id: rider.rider_id,
            display_name: rider.display_name,
            is_online: rider.is_online,
            last_heartbeat_at: rider.last_heartbeat_at,
            distance_to_destination_m:
              rider.distance_to_destination_m === null
                ? null
                : Math.round(rider.distance_to_destination_m),
          })),
        );
      }
    }

    const reason = options?.reason || null;
    const outcome = await closeSessionInTransaction(client, {
      rideId,
      session,
      rideStatus: ctx.ride_status,
      actorRiderId: riderId,
      reason,
      markRideCompleted: Boolean(options?.mark_ride_completed),
    });

    await client.query("COMMIT");
    await afterSessionClosed(rideId, riderId, reason, outcome);

    const updatedSession = await getLiveSessionWithParticipants(rideId);
    return {
      ended: outcome.ended,
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

/**
 * Ends a ride without a captain: everyone who rode has finished, or the ride
 * went idle. Returns the closed session, or null if it was already ended.
 */
export const closeLiveSessionBySystem = async (
  rideId: string,
  reason: "all_riders_finished" | "idle_timeout",
): Promise<LiveSessionSummary | null> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ride = await client.query(`SELECT status FROM rides WHERE id = $1 FOR UPDATE`, [rideId]);
    const session = await getLiveSessionByRide(client, rideId);
    if (!ride.rows.length || !session || session.status === "ended") {
      await client.query("ROLLBACK");
      return null;
    }

    const outcome = await closeSessionInTransaction(client, {
      rideId,
      session,
      rideStatus: ride.rows[0].status as string,
      actorRiderId: null,
      reason,
      markRideCompleted: true,
    });

    await client.query("COMMIT");
    await afterSessionClosed(rideId, null, reason, outcome);

    return getLiveSessionWithParticipants(rideId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Sets the group off. Starting the session only gathers riders for the roll
 * call; this is the point the ride is actually under way, so it is also where
 * the ride row becomes active. Idempotent: rolling out twice changes nothing.
 */
export const rollOutLiveSession = async (rideId: string, riderId: string) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ctx = await getRideContext(client, rideId, riderId);
    requireCaptainOrCoCaptain(ctx);

    const session = await getLiveSessionByRide(client, rideId);
    if (!session || session.status === "ended") {
      throw new LiveSessionError("No live session to roll out", 400);
    }

    const wasStarting = session.status === "starting";

    if (wasStarting) {
      await client.query(
        `UPDATE ride_live_sessions
         SET status = 'active', updated_at = now()
         WHERE id = $1`,
        [session.id],
      );

      await client.query(
        `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
         VALUES ($1, $2, 'session_rolled_out', jsonb_build_object('source', 'api'))`,
        [session.id, riderId],
      );

      // The group setting off starts the ride of everyone who has turned up.
      await markPresentRidersStarted(client, session.id);
    }

    if (ctx.ride_status === "scheduled") {
      await client.query(
        `UPDATE rides SET status = 'active', updated_at = now() WHERE id = $1`,
        [rideId],
      );
    }

    await client.query("COMMIT");

    return {
      rolledOut: wasStarting,
      session: await getLiveSessionWithParticipants(rideId),
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

interface AdvanceArrivalInput {
  rideId: string;
  sessionId: string;
  riderId: string;
  progress: { arrival_armed: boolean; arrived_at: string | null } | null;
  lon: number;
  lat: number;
  accuracyM: number | null;
  capturedAtMs: number;
}

/** Moves the rider's arrival state on by one fix. A ride without a destination never arrives. */
const advanceArrival = async (
  client: SqlClient,
  input: AdvanceArrivalInput,
): Promise<ArrivalTransition> => {
  const result = await client.query(
    `SELECT ST_Distance(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, r.end_point) AS distance_m
     FROM rides r
     WHERE r.id = $3`,
    [input.lon, input.lat, input.rideId],
  );
  const rawDistance = result.rows[0]?.distance_m;
  if (rawDistance === null || rawDistance === undefined) return "none";

  const step = nextArrivalState(
    {
      isArmed: input.progress?.arrival_armed ?? false,
      arrivedAtMs: input.progress?.arrived_at ? Date.parse(input.progress.arrived_at) : null,
    },
    {
      distanceToDestinationM: Number(rawDistance),
      accuracyM: input.accuracyM,
      capturedAtMs: input.capturedAtMs,
    },
    RIDE_PROGRESS_CONFIG.arrival,
  );

  if (step.transition !== "none") {
    await updateArrivalState(client, input.sessionId, input.riderId, step.state);
  }
  return step.transition;
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
  /** How this fix moved the rider relative to the destination. */
  arrival: ArrivalTransition;
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

    // A rider who has finished stops sharing where they are: the group sees
    // where they finished, not the ride home.
    const progress = await lockRiderProgress(client, session.id, riderId);
    if (progress?.finished_at) {
      await client.query("ROLLBACK");
      return null;
    }

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

    // A rider's ride runs from their own start — early, or the group rolling
    // out. Positions from the roll call before that are shared, not recorded.
    const isRiding = Boolean(progress?.ride_started_at) || session.status === "active";
    if (isRiding && !progress?.ride_started_at) {
      await markRiderStarted(client, session.id, riderId);
    }

    const arrival = isRiding
      ? await advanceArrival(client, {
          rideId,
          sessionId: session.id as string,
          riderId,
          progress,
          lon: input.lon,
          lat: input.lat,
          accuracyM: input.accuracy_m ?? null,
          capturedAtMs: Number.isFinite(capturedAtMs) ? capturedAtMs : nowMs,
        })
      : "none";

    if (options?.persistSample && isRiding) {
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
      arrival,
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
  cursor?: string; // opaque cursor in the format <captured_at_iso>|<id>
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
    const [cursorCapturedAt, cursorId] = opts.cursor.split("|");
    const parsedCursorId = Number.parseInt(cursorId ?? "", 10);

    if (cursorCapturedAt && Number.isFinite(parsedCursorId)) {
      conditions.push(
        `(s.captured_at, s.id) > ($${pidx++}::timestamptz, $${pidx++}::bigint)`,
      );
      params.push(cursorCapturedAt, parsedCursorId);
    }
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
  const nextCursor = hasMore
    ? `${pageRows[pageRows.length - 1]!.captured_at as string}|${String(pageRows[pageRows.length - 1]!.id)}`
    : null;

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
