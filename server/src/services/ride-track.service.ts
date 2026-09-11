/**
 * Ride history: the track each rider actually travelled, and when they
 * reached each waypoint of the ride.
 */
import { query } from "../config/db.js";
import type { WaypointReachedInput } from "../schemas/live-session.schemas.js";
import { buildTrack, type TrackSample } from "../utils/track.js";
import { LiveSessionError, getLiveSession } from "./live-session.service.js";

/** Keeps one request bounded; at one sample per 20 m this is well over 400 km. */
const MAX_TRACK_SAMPLES = 20_000;
const RECORDABLE_SESSION_STATUSES: ReadonlySet<string> = new Set(["starting", "active", "paused"]);

export interface WaypointArrival {
  waypoint_id: string;
  waypoint_kind: string | null;
  reached_at: string;
}

export interface RiderTrackResponse {
  session: { id: string; status: string; started_at: string | null; ended_at: string | null };
  track: {
    encoded_polyline: string;
    point_count: number;
    distance_m: number;
    duration_s: number;
    started_at: string | null;
    ended_at: string | null;
  };
  waypoint_arrivals: WaypointArrival[];
}

const toIso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const msToIso = (value: number | null): string | null =>
  value === null ? null : new Date(value).toISOString();

const assertConfirmedParticipant = async (rideId: string, riderId: string): Promise<void> => {
  const result = await query(
    `SELECT (
       r.captain_id = $2 OR EXISTS (
         SELECT 1 FROM ride_participants rp
         WHERE rp.ride_id = r.id
           AND rp.rider_id = $2
           AND rp.status = 'confirmed'
       )
     ) AS is_participant
     FROM rides r
     WHERE r.id = $1`,
    [rideId, riderId],
  );

  const row = result.rows[0];
  if (!row) throw new LiveSessionError("Ride not found", 404);
  if (!row.is_participant) {
    throw new LiveSessionError("Only confirmed participants can view their track", 403);
  }
};

/** The caller's own track for a ride. Other riders' tracks are not exposed here. */
export const getRiderTrack = async (
  rideId: string,
  riderId: string,
): Promise<RiderTrackResponse> => {
  await assertConfirmedParticipant(rideId, riderId);

  const sessionResult = await query(
    `SELECT id, status, started_at, ended_at
     FROM ride_live_sessions
     WHERE ride_id = $1`,
    [rideId],
  );
  const sessionRow = sessionResult.rows[0];
  if (!sessionRow) throw new LiveSessionError("No live session found for this ride", 404);

  const [samplesResult, arrivalsResult] = await Promise.all([
    query(
      `SELECT ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              accuracy_m,
              captured_at
       FROM ride_live_location_samples
       WHERE session_id = $1
         AND rider_id = $2
       ORDER BY captured_at ASC, id ASC
       LIMIT $3`,
      [sessionRow.id, riderId, MAX_TRACK_SAMPLES],
    ),
    query(
      `SELECT DISTINCT ON (payload->>'waypoint_id')
              payload->>'waypoint_id' AS waypoint_id,
              payload->>'waypoint_kind' AS waypoint_kind,
              payload->>'reached_at' AS reached_at
       FROM ride_live_events
       WHERE session_id = $1
         AND actor_rider_id = $2
         AND event_type = 'waypoint_reached'
       ORDER BY payload->>'waypoint_id', created_at ASC`,
      [sessionRow.id, riderId],
    ),
  ]);

  const samples: TrackSample[] = samplesResult.rows.map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    accuracyM: row.accuracy_m != null ? Number(row.accuracy_m) : null,
    capturedAtMs: new Date(row.captured_at).getTime(),
  }));
  const track = buildTrack(samples);

  const waypointArrivals = arrivalsResult.rows
    .flatMap((row): WaypointArrival[] => {
      const reachedAt = toIso(row.reached_at);
      return reachedAt && row.waypoint_id
        ? [
            {
              waypoint_id: String(row.waypoint_id),
              waypoint_kind: row.waypoint_kind ?? null,
              reached_at: reachedAt,
            },
          ]
        : [];
    })
    .sort((left, right) => left.reached_at.localeCompare(right.reached_at));

  return {
    session: {
      id: String(sessionRow.id),
      status: String(sessionRow.status),
      started_at: toIso(sessionRow.started_at),
      ended_at: toIso(sessionRow.ended_at),
    },
    track: {
      encoded_polyline: track.encodedPolyline,
      point_count: track.pointCount,
      distance_m: track.distanceMeters,
      duration_s: track.durationSeconds,
      started_at: msToIso(track.startedAtMs),
      ended_at: msToIso(track.endedAtMs),
    },
    waypoint_arrivals: waypointArrivals,
  };
};

/**
 * Records that a rider reached a waypoint. The first arrival counts; repeats —
 * a reopened navigation screen re-sending what it already sent — are ignored.
 * Returns whether a new arrival was stored.
 */
export const recordWaypointReached = async (
  rideId: string,
  riderId: string,
  input: WaypointReachedInput,
): Promise<boolean> => {
  const session = await getLiveSession(rideId, riderId);
  if (!RECORDABLE_SESSION_STATUSES.has(session.status)) {
    throw new LiveSessionError("Live session is not active", 400);
  }

  const result = await query(
    `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
     SELECT $1, $2, 'waypoint_reached',
            jsonb_build_object('waypoint_id', $3::text, 'waypoint_kind', $4::text, 'reached_at', $5::text)
     WHERE NOT EXISTS (
       SELECT 1 FROM ride_live_events
       WHERE session_id = $1
         AND actor_rider_id = $2
         AND event_type = 'waypoint_reached'
         AND payload->>'waypoint_id' = $3::text
     )`,
    [session.id, riderId, input.waypoint_id, input.waypoint_kind, input.reached_at],
  );

  return (result.rowCount ?? 0) > 0;
};
