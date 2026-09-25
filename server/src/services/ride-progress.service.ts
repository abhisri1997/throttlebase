/**
 * Each rider's own ride within a group ride: starting early, finishing when
 * they are done, and the group ride closing itself once everyone has finished
 * or it has gone idle.
 */
import pool, { query } from "../config/db.js";
import { RIDE_PROGRESS_CONFIG } from "../core/ride-progress/config.js";
import {
  canStartOwnRide,
  classifyManualFinish,
  type FinishReason,
} from "../core/ride-progress/progress.js";
import { enqueueRideStatsRecompute } from "./jobs.service.js";
import {
  LiveSessionError,
  closeLiveSessionBySystem,
  getLiveSessionByRide,
  getLiveSessionWithParticipants,
  getRideContext,
  requireConfirmedParticipant,
  seedSessionPresence,
} from "./live-session.service.js";
import { createNotificationsForRiders } from "./notifications.service.js";
import {
  clearRiderFinish,
  haveAllStartedRidersFinished,
  lockRiderProgress,
  markRiderFinished,
  markRiderStarted,
  toFinishPosition,
  type SqlClient,
} from "./ride-progress.repository.js";

type LiveSession = NonNullable<Awaited<ReturnType<typeof getLiveSessionWithParticipants>>>;

/** A group ride that has rolled out can complete itself; a roll call cannot. */
const SELF_COMPLETING_SESSION_STATUSES: ReadonlySet<string> = new Set(["active", "paused"]);
const OPEN_SESSION_STATUSES = ["starting", "active", "paused"];
const SWEEP_BATCH_SIZE = 100;

const withTransaction = async <T>(work: (client: SqlClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const recordEvent = async (
  client: SqlClient,
  sessionId: string,
  riderId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  await client.query(
    `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [sessionId, riderId, eventType, JSON.stringify(payload)],
  );
};

const requireOpenSession = async (client: SqlClient, rideId: string) => {
  const session = await getLiveSessionByRide(client, rideId);
  if (!session || session.status === "ended") {
    throw new LiveSessionError("This ride is not live", 400);
  }
  return session as { id: string; status: string };
};

const enqueueRiderStats = async (rideId: string, riderId: string): Promise<void> => {
  try {
    await enqueueRideStatsRecompute(rideId, "rider-finished", riderId);
  } catch (queueError) {
    console.error("Failed to enqueue rider stats recompute job:", queueError);
  }
};

// ─── Starting ────────────────────────────────────────────────────────────────

export interface StartOwnRideResult {
  /** The rider's start opened the live session — nobody had started it yet. */
  openedSession: boolean;
  session: LiveSession | null;
}

/**
 * Starts this rider's own ride. Allowed from the early-start window before the
 * scheduled time, without waiting for the captain: if nobody has opened the
 * live session yet, this opens it as a roll call the captain can still run.
 */
export const startOwnRide = async (
  rideId: string,
  riderId: string,
): Promise<StartOwnRideResult> => {
  const openedSession = await withTransaction(async (client) => {
    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const ride = await client.query(`SELECT scheduled_at FROM rides WHERE id = $1`, [rideId]);
    const scheduledAt = ride.rows[0]?.scheduled_at as string | Date | null | undefined;
    const verdict = canStartOwnRide({
      rideStatus: ctx.ride_status,
      scheduledAtMs: scheduledAt ? new Date(scheduledAt).getTime() : null,
      nowMs: Date.now(),
      earlyStartWindowMs: RIDE_PROGRESS_CONFIG.earlyStartWindowMs,
    });
    if (!verdict.isAllowed) {
      throw new LiveSessionError(verdict.reason, 400);
    }

    let session = await getLiveSessionByRide(client, rideId);
    if (session?.status === "ended") {
      throw new LiveSessionError("This ride's live session has ended", 409);
    }

    const isOpening = !session;
    if (!session) {
      const insert = await client.query(
        `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at, created_at, updated_at)
         VALUES ($1, 'starting', $2, now(), now(), now())
         RETURNING id, status`,
        [rideId, riderId],
      );
      session = insert.rows[0];
      await recordEvent(client, session.id, riderId, "session_started", { source: "rider_early_start" });
    }

    await seedSessionPresence(client, rideId, session.id);

    const progress = await lockRiderProgress(client, session.id, riderId);
    if (progress?.finished_at) {
      throw new LiveSessionError("You've already finished this ride — resume it instead", 409);
    }

    if (!progress?.ride_started_at) {
      await markRiderStarted(client, session.id, riderId);
      await recordEvent(client, session.id, riderId, "rider_started", {});
    }

    return isOpening;
  });

  return { openedSession, session: await getLiveSessionWithParticipants(rideId) };
};

// ─── Finishing ───────────────────────────────────────────────────────────────

export interface FinishOwnRideResult {
  reason: FinishReason;
  alreadyFinished: boolean;
  session: LiveSession | null;
  /** Set when this was the last rider out and the group ride completed. */
  closedSession: LiveSession | null;
}

/**
 * Closes the group ride once it has rolled out and everyone who rode it has
 * finished. Returns the closed session, or null if the ride goes on.
 */
export const completeGroupIfAllFinished = async (rideId: string): Promise<LiveSession | null> => {
  const client = await pool.connect();
  let isComplete = false;
  try {
    const session = await getLiveSessionByRide(client, rideId);
    isComplete =
      Boolean(session) &&
      SELF_COMPLETING_SESSION_STATUSES.has(session.status) &&
      (await haveAllStartedRidersFinished(client, session.id));
  } finally {
    client.release();
  }

  return isComplete ? closeLiveSessionBySystem(rideId, "all_riders_finished") : null;
};

/**
 * Finishes this rider's ride by hand. Near the destination it counts as an
 * arrival, anywhere else as leaving early — either way the group sees it.
 */
export const finishOwnRide = async (
  rideId: string,
  riderId: string,
): Promise<FinishOwnRideResult> => {
  const outcome = await withTransaction(async (client) => {
    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const session = await requireOpenSession(client, rideId);
    const progress = await lockRiderProgress(client, session.id, riderId);

    if (progress?.finished_at && progress.finish_reason) {
      return { reason: progress.finish_reason, alreadyFinished: true };
    }
    if (!progress?.ride_started_at) {
      throw new LiveSessionError("You haven't started this ride yet", 409);
    }

    const reason = classifyManualFinish(
      toFinishPosition(progress),
      RIDE_PROGRESS_CONFIG.arrival.arriveRadiusM,
    );
    await markRiderFinished(client, session.id, riderId, reason);
    await recordEvent(client, session.id, riderId, "rider_finished", { reason, source: "rider" });

    return { reason, alreadyFinished: false };
  });

  if (!outcome.alreadyFinished) {
    await enqueueRiderStats(rideId, riderId);
  }

  const closedSession = outcome.alreadyFinished ? null : await completeGroupIfAllFinished(rideId);
  return {
    ...outcome,
    session: closedSession ?? (await getLiveSessionWithParticipants(rideId)),
    closedSession,
  };
};

/** Takes back a finish while the group ride is still live. */
export const resumeOwnRide = async (
  rideId: string,
  riderId: string,
): Promise<{ session: LiveSession | null }> => {
  await withTransaction(async (client) => {
    const ctx = await getRideContext(client, rideId, riderId);
    requireConfirmedParticipant(ctx);

    const session = await requireOpenSession(client, rideId);
    const progress = await lockRiderProgress(client, session.id, riderId);
    if (!progress?.finished_at) {
      throw new LiveSessionError("You haven't finished this ride", 409);
    }

    await clearRiderFinish(client, session.id, riderId);
    await recordEvent(client, session.id, riderId, "rider_resumed", {});
  });

  return { session: await getLiveSessionWithParticipants(rideId) };
};

// ─── The rider's device ──────────────────────────────────────────────────────

export interface RidingRide {
  id: string;
  status: string;
  captain_id: string;
}

/**
 * The rides this rider's device should be tracking: their own ride is under
 * way — started early, or the group has rolled out — and they have not
 * finished. A finished rider's phone stops reporting; one who started before
 * the captain keeps reporting from the background.
 */
export const listRidesBeingRidden = async (riderId: string): Promise<RidingRide[]> => {
  const result = await query(
    `SELECT r.id, r.status, r.captain_id
     FROM ride_live_presence p
     JOIN ride_live_sessions s ON s.id = p.session_id
     JOIN rides r ON r.id = s.ride_id
     WHERE p.rider_id = $1
       AND p.finished_at IS NULL
       AND s.status = ANY($2::text[])
       AND (p.ride_started_at IS NOT NULL OR s.status IN ('active', 'paused'))
     ORDER BY COALESCE(p.ride_started_at, s.started_at) DESC`,
    [riderId, OPEN_SESSION_STATUSES],
  );
  return result.rows as RidingRide[];
};

// ─── Worker sweeps ───────────────────────────────────────────────────────────

interface AwaitingRider {
  ride_id: string;
  ride_title: string | null;
  session_id: string;
  rider_id: string;
}

const notifyAutoFinished = async (rider: AwaitingRider): Promise<void> => {
  try {
    await createNotificationsForRiders({
      riderIds: [rider.rider_id],
      type: "ride_auto_finished",
      title: "Ride finished",
      body: `You arrived at the end of ${rider.ride_title || "your ride"}, so we finished your ride for you.`,
      data: { ride_id: rider.ride_id, session_id: rider.session_id, event: "ride_progress.auto_finished" },
      dedupeKey: `ride_auto_finished:${rider.session_id}:${rider.rider_id}`,
    });
  } catch (error) {
    console.error("Failed to notify rider of auto-finish:", error);
  }
};

/**
 * Finishes riders who have stayed at the destination for the dwell time,
 * whether or not they saw the prompt. Their finish is dated to their arrival.
 */
export const autoFinishArrivedRiders = async (): Promise<{ finished: number; closedRides: number }> => {
  const dwellSeconds = Math.round(RIDE_PROGRESS_CONFIG.autoFinishDwellMs / 1000);
  const candidates = await query(
    `SELECT s.ride_id, r.title AS ride_title, p.session_id, p.rider_id
     FROM ride_live_presence p
     JOIN ride_live_sessions s ON s.id = p.session_id
     JOIN rides r ON r.id = s.ride_id
     WHERE s.status = ANY($1::text[])
       AND p.finished_at IS NULL
       AND p.ride_started_at IS NOT NULL
       AND p.arrived_at <= now() - ($2 || ' seconds')::interval
     ORDER BY p.arrived_at ASC
     LIMIT $3`,
    [OPEN_SESSION_STATUSES, String(dwellSeconds), SWEEP_BATCH_SIZE],
  );

  let finished = 0;
  const rideIds = new Set<string>();

  for (const rider of candidates.rows as AwaitingRider[]) {
    const didFinish = await withTransaction(async (client) => {
      // Re-read under lock: the rider may have left or finished meanwhile.
      const progress = await lockRiderProgress(client, rider.session_id, rider.rider_id);
      const arrivedAtMs = progress?.arrived_at ? Date.parse(progress.arrived_at) : null;
      const isStillWaiting =
        progress !== null &&
        !progress.finished_at &&
        arrivedAtMs !== null &&
        Date.now() - arrivedAtMs >= RIDE_PROGRESS_CONFIG.autoFinishDwellMs;
      if (!isStillWaiting) return false;

      await markRiderFinished(client, rider.session_id, rider.rider_id, "arrived");
      await recordEvent(client, rider.session_id, rider.rider_id, "rider_finished", {
        reason: "arrived",
        source: "auto_arrival",
      });
      return true;
    });

    if (!didFinish) continue;

    finished += 1;
    rideIds.add(rider.ride_id);
    await enqueueRiderStats(rider.ride_id, rider.rider_id);
    await notifyAutoFinished(rider);
  }

  let closedRides = 0;
  for (const rideId of rideIds) {
    if (await completeGroupIfAllFinished(rideId)) closedRides += 1;
  }

  return { finished, closedRides };
};

/**
 * Ends live rides nobody is riding any more: no rider still out has reported
 * for the idle window. Stops a forgotten ride — or an early start the captain
 * never followed — staying live for good.
 */
export const endIdleRides = async (): Promise<{ ended: number }> => {
  const idleSeconds = Math.round(RIDE_PROGRESS_CONFIG.idleAutoEndMs / 1000);
  const idle = await query(
    `SELECT s.ride_id
     FROM ride_live_sessions s
     WHERE s.status = ANY($1::text[])
       AND COALESCE(s.started_at, s.created_at) <= now() - ($2 || ' seconds')::interval
       AND NOT EXISTS (
         SELECT 1
         FROM ride_live_presence p
         WHERE p.session_id = s.id
           AND p.finished_at IS NULL
           AND p.last_heartbeat_at > now() - ($2 || ' seconds')::interval
       )
     LIMIT $3`,
    [OPEN_SESSION_STATUSES, String(idleSeconds), SWEEP_BATCH_SIZE],
  );

  let ended = 0;
  for (const row of idle.rows as Array<{ ride_id: string }>) {
    if (await closeLiveSessionBySystem(row.ride_id, "idle_timeout")) ended += 1;
  }
  return { ended };
};
