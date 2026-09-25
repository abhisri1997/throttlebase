/**
 * SQL for each rider's own progress through a live ride. Every function runs
 * on the caller's client, inside the caller's transaction.
 */
import {
  classifyGroupEndFinish,
  type FinishPosition,
  type FinishReason,
} from "../core/ride-progress/progress.js";

export interface SqlClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface RiderProgressRow {
  session_id: string;
  rider_id: string;
  ride_started_at: string | null;
  finished_at: string | null;
  finish_reason: FinishReason | null;
  arrival_armed: boolean;
  arrived_at: string | null;
  /** Metres from the last known position to the ride's destination; null if either is unknown. */
  distance_to_destination_m: number | null;
}

export interface RidingRiderRow extends RiderProgressRow {
  display_name: string | null;
  is_online: boolean;
  last_heartbeat_at: string | null;
}

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const mapProgressRow = (row: any): RiderProgressRow => ({
  session_id: row.session_id,
  rider_id: row.rider_id,
  ride_started_at: row.ride_started_at,
  finished_at: row.finished_at,
  finish_reason: row.finish_reason,
  arrival_armed: row.arrival_armed,
  arrived_at: row.arrived_at,
  distance_to_destination_m: toNumberOrNull(row.distance_to_destination_m),
});

export const toFinishPosition = (row: RiderProgressRow): FinishPosition => ({
  distanceToDestinationM: row.distance_to_destination_m,
  hasArrived: row.arrived_at !== null,
});

const PROGRESS_COLUMNS = `
  p.session_id,
  p.rider_id,
  p.ride_started_at,
  p.finished_at,
  p.finish_reason,
  p.arrival_armed,
  p.arrived_at,
  ST_Distance(p.last_location, r.end_point) AS distance_to_destination_m`;

/** One rider's progress, locked for update. Null if they have no presence row yet. */
export const lockRiderProgress = async (
  client: SqlClient,
  sessionId: string,
  riderId: string,
): Promise<RiderProgressRow | null> => {
  const result = await client.query(
    `SELECT ${PROGRESS_COLUMNS}
     FROM ride_live_presence p
     JOIN ride_live_sessions s ON s.id = p.session_id
     JOIN rides r ON r.id = s.ride_id
     WHERE p.session_id = $1 AND p.rider_id = $2
     FOR UPDATE OF p`,
    [sessionId, riderId],
  );
  return result.rows[0] ? mapProgressRow(result.rows[0]) : null;
};

/** Riders who started and have not finished, each with how far they are from the destination. */
export const listRidingRiders = async (
  client: SqlClient,
  sessionId: string,
): Promise<RidingRiderRow[]> => {
  const result = await client.query(
    `SELECT ${PROGRESS_COLUMNS},
            rd.display_name,
            p.is_online,
            p.last_heartbeat_at
     FROM ride_live_presence p
     JOIN ride_live_sessions s ON s.id = p.session_id
     JOIN rides r ON r.id = s.ride_id
     JOIN riders rd ON rd.id = p.rider_id
     WHERE p.session_id = $1
       AND p.ride_started_at IS NOT NULL
       AND p.finished_at IS NULL
     ORDER BY rd.display_name ASC`,
    [sessionId],
  );
  return result.rows.map((row) => ({
    ...mapProgressRow(row),
    display_name: row.display_name,
    is_online: row.is_online,
    last_heartbeat_at: row.last_heartbeat_at,
  }));
};

export const markRiderStarted = async (
  client: SqlClient,
  sessionId: string,
  riderId: string,
): Promise<void> => {
  await client.query(
    `UPDATE ride_live_presence
     SET ride_started_at = COALESCE(ride_started_at, now()),
         updated_at = now()
     WHERE session_id = $1 AND rider_id = $2`,
    [sessionId, riderId],
  );
};

/**
 * Rolling out starts everyone who has shown up — joined the session or sent a
 * position. A rider who never appeared is started by their first position.
 */
export const markPresentRidersStarted = async (
  client: SqlClient,
  sessionId: string,
): Promise<void> => {
  await client.query(
    `UPDATE ride_live_presence
     SET ride_started_at = now(),
         updated_at = now()
     WHERE session_id = $1
       AND ride_started_at IS NULL
       AND finished_at IS NULL
       AND last_heartbeat_at IS NOT NULL`,
    [sessionId],
  );
};

/**
 * Finishes one rider. An arrival is dated to when they reached the
 * destination, so time spent there is not part of their ride.
 */
export const markRiderFinished = async (
  client: SqlClient,
  sessionId: string,
  riderId: string,
  reason: FinishReason,
): Promise<void> => {
  await client.query(
    `UPDATE ride_live_presence
     SET finished_at = CASE
                         WHEN $3::text = 'arrived' THEN COALESCE(arrived_at, now())
                         ELSE now()
                       END,
         finish_reason = $3::text,
         finish_location = last_location,
         updated_at = now()
     WHERE session_id = $1
       AND rider_id = $2
       AND finished_at IS NULL`,
    [sessionId, riderId, reason],
  );
};

/**
 * Undoes a finish while the group ride is still live. A rider still at the
 * destination stays arrived, but the auto-finish clock restarts from now so
 * they are not finished again the moment the sweep runs.
 */
export const clearRiderFinish = async (
  client: SqlClient,
  sessionId: string,
  riderId: string,
): Promise<void> => {
  await client.query(
    `UPDATE ride_live_presence
     SET finished_at = NULL,
         finish_reason = NULL,
         finish_location = NULL,
         arrived_at = CASE WHEN arrived_at IS NULL THEN NULL ELSE now() END,
         updated_at = now()
     WHERE session_id = $1 AND rider_id = $2`,
    [sessionId, riderId],
  );
};

/** Finishes everyone still riding when the group ride ends. Returns who was finished. */
export const finishRemainingRiders = async (
  client: SqlClient,
  sessionId: string,
  arriveRadiusM: number,
): Promise<Array<{ riderId: string; reason: FinishReason }>> => {
  const riding = await listRidingRiders(client, sessionId);
  const finished: Array<{ riderId: string; reason: FinishReason }> = [];

  for (const rider of riding) {
    const reason = classifyGroupEndFinish(toFinishPosition(rider), arriveRadiusM);
    await markRiderFinished(client, sessionId, rider.rider_id, reason);
    finished.push({ riderId: rider.rider_id, reason });
  }

  return finished;
};

/** A reopened session starts every rider's ride afresh. */
export const resetSessionProgress = async (
  client: SqlClient,
  sessionId: string,
): Promise<void> => {
  await client.query(
    `UPDATE ride_live_presence
     SET ride_started_at = NULL,
         finished_at = NULL,
         finish_reason = NULL,
         finish_location = NULL,
         arrival_armed = false,
         arrived_at = NULL,
         updated_at = now()
     WHERE session_id = $1`,
    [sessionId],
  );
};

export const updateArrivalState = async (
  client: SqlClient,
  sessionId: string,
  riderId: string,
  state: { isArmed: boolean; arrivedAtMs: number | null },
): Promise<void> => {
  await client.query(
    `UPDATE ride_live_presence
     SET arrival_armed = $3,
         arrived_at = $4::timestamptz,
         updated_at = now()
     WHERE session_id = $1 AND rider_id = $2`,
    [
      sessionId,
      riderId,
      state.isArmed,
      state.arrivedAtMs === null ? null : new Date(state.arrivedAtMs).toISOString(),
    ],
  );
};

/** Whether anyone started riding and everyone who did has finished. */
export const haveAllStartedRidersFinished = async (
  client: SqlClient,
  sessionId: string,
): Promise<boolean> => {
  const result = await client.query(
    `SELECT count(*) FILTER (WHERE ride_started_at IS NOT NULL)::int AS started,
            count(*) FILTER (WHERE ride_started_at IS NOT NULL AND finished_at IS NULL)::int AS riding
     FROM ride_live_presence
     WHERE session_id = $1`,
    [sessionId],
  );
  const row = result.rows[0] ?? { started: 0, riding: 0 };
  return row.started > 0 && row.riding === 0;
};
