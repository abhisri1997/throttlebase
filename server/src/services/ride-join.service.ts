/**
 * Joining a ride, and asking to join one that needs approval.
 *
 * Anyone joins a public ride at once. A ride that needs approval
 * (visibility 'private') is asked for: the request holds no seat and waits
 * until the captain or a co-captain accepts or declines it. The rules are
 * in core/rides/joinRequest.ts. Whoever needs to know is told through the
 * job queue, queued in the same transaction, so nobody hears of a request
 * or an answer that didn't commit.
 *
 * Until they are accepted, a rider sees only a preview of the ride
 * (core/rides/ridePreview.ts): never where it meets, where it goes, or who
 * is on it.
 */
import pool from "../config/db.js";
import {
  decideJoin,
  describeMyRequest,
  type ExistingSeat,
  type JoinRefusal,
  type ParticipantStatus,
  type RideVisibility,
} from "../core/rides/joinRequest.js";
import { toRidePreview, type RidePreview } from "../core/rides/ridePreview.js";
import { JOB_TYPES } from "../queue/job-types.js";
import { inTransaction, syncRiderCounts } from "./ride-roster.service.js";
import { getRideById, recalculateStartPoint, type Ride } from "./ride.service.js";
import type { SqlClient } from "./ride-progress.repository.js";

/** Rides a rider can join or ask to join. */
const JOINABLE_RIDE_STATUSES: ReadonlySet<string> = new Set(["scheduled", "active"]);

/** [longitude, latitude], already range-checked by the request schema. */
export type LngLat = readonly [number, number];

export type JoinOutcome = "joined" | "requested";

export type RideJoinRefusal = JoinRefusal | "not_found" | "not_joinable" | "full" | "not_leader" | "no_request";

const REFUSAL_MESSAGES: Readonly<Record<RideJoinRefusal, string>> = {
  not_found: "Ride not found",
  not_joinable: "Cannot join this ride: it isn't open for riders",
  full: "This ride has reached its maximum capacity",
  already_on_ride: "You are already a participant of this ride",
  already_requested: "You've already asked to join this ride",
  declined: "The ride's leaders declined your request to join",
  not_leader: "Only the captain or a co-captain can answer requests to join",
  no_request: "There's no request to join waiting",
};

export class RideJoinError extends Error {
  constructor(readonly kind: RideJoinRefusal) {
    super(REFUSAL_MESSAGES[kind]);
    this.name = "RideJoinError";
  }
}

interface LockedRide {
  status: string;
  visibility: RideVisibility;
  captain_id: string;
  max_capacity: number | null;
  start_point_auto: boolean;
}

/** Nobody new joins a ride whose captain has deleted their account. */
const lockRide = async (client: SqlClient, rideId: string): Promise<LockedRide> => {
  const result = await client.query(
    `SELECT r.status, r.visibility, r.captain_id::text AS captain_id, r.max_capacity,
            COALESCE(r.start_point_auto, false) AS start_point_auto
       FROM rides r JOIN riders c ON c.id = r.captain_id
      WHERE r.id = $1 AND c.deleted_at IS NULL
      FOR UPDATE OF r`,
    [rideId],
  );
  const ride = result.rows[0] as LockedRide | undefined;
  if (!ride) throw new RideJoinError("not_found");
  return ride;
};

const toSeat = (status: unknown, declineCount: unknown): ExistingSeat | null =>
  typeof status === "string" ? { status: status as ParticipantStatus, declineCount: Number(declineCount ?? 0) } : null;

const loadSeat = async (client: SqlClient, rideId: string, riderId: string): Promise<ExistingSeat | null> => {
  const result = await client.query(
    `SELECT status, decline_count FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
    [rideId, riderId],
  );
  return toSeat(result.rows[0]?.status, result.rows[0]?.decline_count);
};

/** Only confirmed riders take a seat; a waiting request doesn't. */
const isFull = async (client: SqlClient, rideId: string, maxCapacity: number | null): Promise<boolean> => {
  if (maxCapacity == null) return false;
  const result = await client.query(
    `SELECT count(*)::int AS riders FROM ride_participants WHERE ride_id = $1 AND status = 'confirmed'`,
    [rideId],
  );
  return Number(result.rows[0].riders) >= maxCapacity;
};

/**
 * Puts the rider on the ride, or their request in. A rider who left, or was
 * declined, has a row already; it is reused, keeping its decline count.
 */
const upsertSeat = async (
  client: SqlClient,
  rideId: string,
  riderId: string,
  status: "confirmed" | "requested",
  startLocation: LngLat | undefined,
  at: Date,
): Promise<void> => {
  await client.query(
    `INSERT INTO ride_participants
       (ride_id, rider_id, role, status, joined_at, requested_at, start_location_override)
     VALUES ($1, $2, 'rider', $3::varchar,
             CASE WHEN $3::varchar = 'confirmed' THEN $4::timestamptz END,
             CASE WHEN $3::varchar = 'requested' THEN $4::timestamptz END,
             CASE WHEN $5::float8 IS NULL THEN NULL
                  ELSE ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography END)
     ON CONFLICT (ride_id, rider_id) DO UPDATE
       SET status = EXCLUDED.status, role = 'rider', joined_at = EXCLUDED.joined_at,
           requested_at = EXCLUDED.requested_at, left_at = NULL, dropout_coords = NULL,
           start_location_override = EXCLUDED.start_location_override`,
    [rideId, riderId, status, at, startLocation?.[0] ?? null, startLocation?.[1] ?? null],
  );
};

const queueJob = async (client: SqlClient, type: string, payload: Record<string, unknown>): Promise<void> => {
  await client.query(`INSERT INTO jobs (type, payload) VALUES ($1, $2::jsonb)`, [type, JSON.stringify(payload)]);
};

/** A meeting point worked out from where riders start moves when one joins. */
const recalculateInBackground = (rideId: string): void => {
  recalculateStartPoint(rideId).catch((error) =>
    console.error(`Failed to recalculate start point for ride ${rideId}:`, error),
  );
};

/**
 * Joins a public ride, or asks to join one that needs approval.
 * `startLocation` is where the rider will ride from, if they said.
 */
export const joinOrRequestRide = async (
  rideId: string,
  riderId: string,
  startLocation?: LngLat,
): Promise<JoinOutcome> => {
  const { outcome, recalculate } = await inTransaction(async (client) => {
    const ride = await lockRide(client, rideId);
    // A finished ride can't be joined: that would also let anyone review it.
    if (!JOINABLE_RIDE_STATUSES.has(ride.status)) throw new RideJoinError("not_joinable");

    const decision = decideJoin(ride.visibility, await loadSeat(client, rideId, riderId));
    if (decision.kind === "refuse") throw new RideJoinError(decision.reason);

    const at = new Date();
    if (decision.kind === "join") {
      if (await isFull(client, rideId, ride.max_capacity)) throw new RideJoinError("full");
      await upsertSeat(client, rideId, riderId, "confirmed", startLocation, at);
      await syncRiderCounts(client, [rideId]);
      return { outcome: "joined" as const, recalculate: ride.start_point_auto };
    }

    await upsertSeat(client, rideId, riderId, "requested", startLocation, at);
    await queueJob(client, JOB_TYPES.RIDE_JOIN_REQUESTED, { rideId, riderId, at: at.toISOString() });
    return { outcome: "requested" as const, recalculate: false };
  });

  if (recalculate) recalculateInBackground(rideId);
  return outcome;
};

/** The rider withdraws a request still waiting. Declines so far still count. */
export const cancelJoinRequest = async (rideId: string, riderId: string): Promise<void> => {
  const result = await pool.query(
    `UPDATE ride_participants SET status = 'dropped_out', left_at = now()
      WHERE ride_id = $1 AND rider_id = $2 AND status = 'requested'`,
    [rideId, riderId],
  );
  if (result.rowCount === 0) throw new RideJoinError("no_request");
};

const isRideLeader = async (client: SqlClient, ride: LockedRide, rideId: string, riderId: string): Promise<boolean> => {
  if (ride.captain_id === riderId) return true;
  const result = await client.query(
    `SELECT 1 FROM ride_participants p JOIN riders r ON r.id = p.rider_id
      WHERE p.ride_id = $1 AND p.rider_id = $2 AND p.status = 'confirmed'
        AND p.role = 'co_captain' AND r.deleted_at IS NULL`,
    [rideId, riderId],
  );
  return result.rows.length > 0;
};

/**
 * The captain or a co-captain accepts or declines a waiting request. Accepting
 * a full ride is refused; declining counts towards the rider's last chance.
 */
export const answerJoinRequest = async (
  rideId: string,
  leaderId: string,
  riderId: string,
  accept: boolean,
): Promise<void> => {
  const recalculate = await inTransaction(async (client) => {
    const ride = await lockRide(client, rideId);
    if (!(await isRideLeader(client, ride, rideId, leaderId))) throw new RideJoinError("not_leader");
    if (!JOINABLE_RIDE_STATUSES.has(ride.status)) throw new RideJoinError("not_joinable");

    const pending = await client.query(
      `SELECT p.decline_count FROM ride_participants p JOIN riders r ON r.id = p.rider_id
        WHERE p.ride_id = $1 AND p.rider_id = $2 AND p.status = 'requested' AND r.deleted_at IS NULL
        FOR UPDATE OF p`,
      [rideId, riderId],
    );
    if (pending.rows.length === 0) throw new RideJoinError("no_request");

    const at = new Date();
    let declineCount = Number(pending.rows[0].decline_count);
    if (accept) {
      if (await isFull(client, rideId, ride.max_capacity)) throw new RideJoinError("full");
      await client.query(
        `UPDATE ride_participants SET status = 'confirmed', joined_at = $3 WHERE ride_id = $1 AND rider_id = $2`,
        [rideId, riderId, at],
      );
      await syncRiderCounts(client, [rideId]);
    } else {
      declineCount += 1;
      await client.query(
        `UPDATE ride_participants SET status = 'rejected', decline_count = $3 WHERE ride_id = $1 AND rider_id = $2`,
        [rideId, riderId, declineCount],
      );
    }

    await queueJob(client, JOB_TYPES.RIDE_JOIN_ANSWERED, {
      rideId,
      riderId,
      accepted: accept,
      declineCount,
      at: at.toISOString(),
    });
    return accept && ride.start_point_auto;
  });

  if (recalculate) recalculateInBackground(rideId);
};

export interface JoinRequest {
  rider_id: string;
  display_name: string | null;
  requested_at: string | null;
  /** 1 when this is the rider's last chance: a leader declined them before. */
  decline_count: number;
}

/** Requests waiting on the ride, oldest first. For its leaders only. */
export const listJoinRequests = async (rideId: string): Promise<JoinRequest[]> => {
  const result = await pool.query(
    `SELECT p.rider_id::text AS rider_id, r.display_name, p.requested_at, p.decline_count
       FROM ride_participants p JOIN riders r ON r.id = p.rider_id
      WHERE p.ride_id = $1 AND p.status = 'requested' AND r.deleted_at IS NULL
      ORDER BY p.requested_at ASC NULLS LAST`,
    [rideId],
  );
  return result.rows.map((row) => ({
    rider_id: row.rider_id as string,
    display_name: (row.display_name as string | null) ?? null,
    requested_at: row.requested_at ? new Date(row.requested_at).toISOString() : null,
    decline_count: Number(row.decline_count),
  }));
};

/**
 * A ride that needs approval, as a rider not yet on it sees it; null when
 * there is nothing they may see.
 */
export const getRidePreview = async (rideId: string, viewerId: string): Promise<RidePreview | null> => {
  const result = await pool.query(
    `SELECT r.*, c.display_name AS captain_name,
            (SELECT count(*) FROM ride_stops rs
              WHERE rs.ride_id = r.id AND rs.status = 'approved')::int AS stop_count,
            me.status AS my_status, me.decline_count AS my_decline_count
       FROM rides r
       JOIN riders c ON c.id = r.captain_id
       LEFT JOIN ride_participants me ON me.ride_id = r.id AND me.rider_id = $2
      WHERE r.id = $1
        AND r.visibility = 'private'
        AND r.status = ANY($3::text[])
        AND c.deleted_at IS NULL`,
    [rideId, viewerId, [...JOINABLE_RIDE_STATUSES]],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return toRidePreview(row, describeMyRequest(toSeat(row.my_status, row.my_decline_count)));
};

const leadsRide = (ride: Ride, riderId: string): boolean =>
  ride.captain_id === riderId ||
  (ride.participants ?? []).some((rider) => rider.rider_id === riderId && rider.role === "co_captain");

/**
 * The ride as this rider may see it: in full when they may, with waiting
 * requests for its leaders; otherwise a preview of a ride that needs
 * approval; otherwise null.
 */
export const getRideForViewer = async (
  rideId: string,
  viewerId: string,
): Promise<(Ride & { join_requests?: JoinRequest[] }) | RidePreview | null> => {
  const ride = await getRideById(rideId, viewerId);
  if (!ride) return getRidePreview(rideId, viewerId);
  if (!leadsRide(ride, viewerId)) return ride;
  return { ...ride, join_requests: await listJoinRequests(rideId) };
};
