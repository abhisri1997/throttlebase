/**
 * Who is on a ride, and who leads it, when a rider leaves ThrottleBase.
 *
 * Every function runs on the caller's client, inside the caller's
 * transaction: account deletion hands the rider's rides on in the same
 * transaction that deletes the account, so a ride never outlives its
 * captain (docs/launch-readiness/plans/account-deletion.md).
 */
import pool from "../config/db.js";
import { pickRideSuccessor, type SuccessorCandidate } from "../core/rides/rideSuccessor.js";
import { JOB_TYPES } from "../queue/job-types.js";
import type { SqlClient } from "./ride-progress.repository.js";

/** Rides that have not finished, so still need a leader and hold seats. */
const OPEN_RIDE_STATUSES = ["draft", "scheduled", "active"];

export interface RideHandoffOutcome {
  /** Rides that passed to a new captain. */
  handedOff: number;
  /** Rides with nobody left to lead them, now cancelled. */
  cancelled: number;
  /** Open rides the rider was on and has now left, their own included. */
  ridesLeft: number;
}

/** Sets each ride's rider count from its confirmed participants. */
export const syncRiderCounts = async (client: SqlClient, rideIds: readonly string[]): Promise<void> => {
  if (rideIds.length === 0) return;
  await client.query(
    `UPDATE rides r
        SET current_rider_count = (
          SELECT count(*)::int FROM ride_participants p
           WHERE p.ride_id = r.id AND p.status = 'confirmed'
        )
      WHERE r.id = ANY($1::uuid[])`,
    [rideIds],
  );
};

const loadSuccessorCandidates = async (
  client: SqlClient,
  rideId: string,
  leavingRiderId: string,
): Promise<SuccessorCandidate[]> => {
  const result = await client.query(
    `SELECT p.rider_id::text AS rider_id, p.role, p.promoted_at, p.joined_at,
            (SELECT count(*)::int
               FROM ride_participants done
               JOIN rides dr ON dr.id = done.ride_id
              WHERE done.rider_id = p.rider_id
                AND done.status = 'confirmed'
                AND dr.status = 'completed') AS completed_rides
       FROM ride_participants p
       JOIN riders r ON r.id = p.rider_id
      WHERE p.ride_id = $1
        AND p.rider_id <> $2
        AND p.status = 'confirmed'
        AND r.deleted_at IS NULL`,
    [rideId, leavingRiderId],
  );
  return result.rows.map((row) => ({
    riderId: row.rider_id as string,
    role: row.role === "co_captain" ? "co_captain" : "rider",
    promotedAt: row.promoted_at ? new Date(row.promoted_at) : null,
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
    completedRides: Number(row.completed_rides),
  }));
};

const passRide = async (client: SqlClient, rideId: string, fromRiderId: string, toRiderId: string): Promise<void> => {
  await client.query(`UPDATE rides SET captain_id = $2, updated_at = now() WHERE id = $1`, [rideId, toRiderId]);
  await client.query(`UPDATE ride_participants SET role = 'captain' WHERE ride_id = $1 AND rider_id = $2`, [
    rideId,
    toRiderId,
  ]);
  // A live ride's session follows, so the new captain leads it.
  await client.query(
    `UPDATE ride_live_presence p
        SET role = 'captain', updated_at = now()
       FROM ride_live_sessions s
      WHERE s.ride_id = $1 AND s.status <> 'ended'
        AND p.session_id = s.id AND p.rider_id = $2`,
    [rideId, toRiderId],
  );
  // Queued in this transaction, so riders are told only if the hand-off commits.
  await client.query(`INSERT INTO jobs (type, payload) VALUES ($1, $2::jsonb)`, [
    JOB_TYPES.RIDE_LEADER_CHANGED,
    JSON.stringify({ rideId, newCaptainId: toRiderId, previousCaptainId: fromRiderId }),
  ]);
};

const cancelRide = async (client: SqlClient, rideId: string, at: Date): Promise<void> => {
  await client.query(`UPDATE rides SET status = 'cancelled', updated_at = now() WHERE id = $1`, [rideId]);
  await client.query(
    `UPDATE ride_live_sessions
        SET status = 'ended', ended_at = $2, ended_reason = 'captain_left', updated_at = now()
      WHERE ride_id = $1 AND status <> 'ended'`,
    [rideId, at],
  );
};

/** The rider leaves every open ride they are on. Returns those rides' ids. */
const leaveOpenRides = async (client: SqlClient, riderId: string, at: Date): Promise<string[]> => {
  const left = await client.query(
    `UPDATE ride_participants p
        SET status = 'dropped_out', role = 'rider', left_at = $2
       FROM rides r
      WHERE r.id = p.ride_id
        AND p.rider_id = $1
        AND p.status = 'confirmed'
        AND r.status = ANY($3::text[])
      RETURNING p.ride_id::text AS ride_id`,
    [riderId, at, OPEN_RIDE_STATUSES],
  );
  await client.query(
    `UPDATE ride_live_presence p
        SET role = 'member', is_online = false, updated_at = now()
       FROM ride_live_sessions s
      WHERE s.id = p.session_id AND s.status <> 'ended' AND p.rider_id = $1`,
    [riderId],
  );
  return left.rows.map((row) => row.ride_id as string);
};

/**
 * Hands each open ride the rider leads to its next leader, or cancels it
 * when nobody is left, then takes the rider off every open ride. Finished
 * rides keep their captain. Safe to run again: a second run finds nothing.
 */
export const handOffRidesOf = async (client: SqlClient, riderId: string, at: Date): Promise<RideHandoffOutcome> => {
  const led = await client.query(
    `SELECT id::text AS id FROM rides
      WHERE captain_id = $1 AND status = ANY($2::text[])
      ORDER BY id
      FOR UPDATE`,
    [riderId, OPEN_RIDE_STATUSES],
  );
  const ledIds = led.rows.map((row) => row.id as string);

  // Leave first: a ride cancelled below would no longer count as open.
  const left = await leaveOpenRides(client, riderId, at);

  let handedOff = 0;
  let cancelled = 0;
  for (const rideId of ledIds) {
    const successor = pickRideSuccessor(await loadSuccessorCandidates(client, rideId, riderId));
    if (successor) {
      await passRide(client, rideId, riderId, successor);
      handedOff += 1;
    } else {
      await cancelRide(client, rideId, at);
      cancelled += 1;
    }
  }

  await syncRiderCounts(client, [...new Set([...ledIds, ...left])]);

  return { handedOff, cancelled, ridesLeft: left.length };
};

/**
 * For riders whose accounts were deleted while they still led or held a
 * seat on an open ride — before hand-off existed, or if it ever failed.
 * Run by the hourly account purge; one transaction per rider. Returns how
 * many rides were handed off or cancelled.
 */
export const handOffRidesOfDeletedRiders = async (): Promise<number> => {
  const riders = await pool.query(
    `SELECT d.id::text AS id
       FROM riders d
       JOIN ride_participants p ON p.rider_id = d.id AND p.status = 'confirmed'
       JOIN rides r ON r.id = p.ride_id AND r.status = ANY($1::text[])
      WHERE d.deleted_at IS NOT NULL
     UNION
     SELECT d.id::text
       FROM riders d
       JOIN rides r ON r.captain_id = d.id AND r.status = ANY($1::text[])
      WHERE d.deleted_at IS NOT NULL`,
    [OPEN_RIDE_STATUSES],
  );

  let rides = 0;
  for (const { id: riderId } of riders.rows as Array<{ id: string }>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await handOffRidesOf(client, riderId, new Date());
      await client.query("COMMIT");
      rides += outcome.handedOff + outcome.cancelled;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return rides;
};
