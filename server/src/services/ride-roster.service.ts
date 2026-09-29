/**
 * Who is on a ride, and who leads it, when riders leave: by deleting their
 * account, by leaving the ride, or by the captain passing it on.
 *
 * The hand-off at account deletion runs on the caller's client, inside the
 * transaction that deletes the account, so a ride never outlives its
 * captain (docs/launch-readiness/plans/account-deletion.md). Leaving and
 * passing on run in their own transactions.
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

/** Why a ride changed captain; the notification says so. */
export type CaptainChangeReason = "account_deleted" | "left" | "passed_on";

export type LeaveRideOutcome = "left" | "handed_over" | "ride_cancelled";

export type RideRosterRefusal =
  | "not_found"
  | "not_on_ride"
  | "ride_started"
  | "ride_over"
  | "not_captain"
  | "target_not_on_ride"
  | "already_captain";

const REFUSAL_MESSAGES: Readonly<Record<RideRosterRefusal, string>> = {
  not_found: "Ride not found",
  not_on_ride: "You're not on this ride",
  ride_started: "The ride has started: finish your ride instead of leaving",
  ride_over: "This ride is over",
  not_captain: "Only the captain can pass the ride on",
  target_not_on_ride: "That rider is not on this ride",
  already_captain: "You're already the captain",
};

export class RideRosterError extends Error {
  constructor(readonly kind: RideRosterRefusal) {
    super(REFUSAL_MESSAGES[kind]);
    this.name = "RideRosterError";
  }
}

/**
 * Confirmed riders other than the leaving one whose accounts still exist.
 * With `lock`, a candidate deleting their own account right now holds these
 * rows: the hand-over waits for it and looks again, so the ride never goes
 * to them. The preview shown before leaving reads without locking.
 */
const loadSuccessorCandidates = async (
  client: SqlClient,
  rideId: string,
  leavingRiderId: string,
  { lock }: { lock: boolean } = { lock: true },
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
        AND r.deleted_at IS NULL
      ${lock ? "FOR SHARE OF p, r" : ""}`,
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

const passRide = async (
  client: SqlClient,
  rideId: string,
  fromRiderId: string,
  toRiderId: string,
  reason: CaptainChangeReason,
  at: Date,
): Promise<void> => {
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
    JSON.stringify({ rideId, newCaptainId: toRiderId, previousCaptainId: fromRiderId, reason, at: at.toISOString() }),
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
      await passRide(client, rideId, riderId, successor, "account_deleted", at);
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

// ── Leaving a ride, and passing it on ──────────────────────────────────────

/** Runs `work` in one transaction on its own client. */
const inTransaction = async <T>(work: (client: SqlClient) => Promise<T>): Promise<T> => {
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

interface LockedRide {
  status: string;
  captain_id: string;
}

const lockRide = async (client: SqlClient, rideId: string): Promise<LockedRide> => {
  const result = await client.query(`SELECT status, captain_id::text FROM rides WHERE id = $1 FOR UPDATE`, [rideId]);
  const ride = result.rows[0] as LockedRide | undefined;
  if (!ride) throw new RideRosterError("not_found");
  return ride;
};

const isConfirmedOnRide = async (client: SqlClient, rideId: string, riderId: string): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1 FROM ride_participants p JOIN riders r ON r.id = p.rider_id
      WHERE p.ride_id = $1 AND p.rider_id = $2 AND p.status = 'confirmed' AND r.deleted_at IS NULL`,
    [rideId, riderId],
  );
  return result.rows.length > 0;
};

/** Sets a rider's role on one ride, in its live session too. */
const setRole = async (client: SqlClient, rideId: string, riderId: string, role: "co_captain"): Promise<void> => {
  await client.query(
    `UPDATE ride_participants SET role = $3, promoted_at = now() WHERE ride_id = $1 AND rider_id = $2`,
    [rideId, riderId, role],
  );
  await client.query(
    `UPDATE ride_live_presence p
        SET role = $3, updated_at = now()
       FROM ride_live_sessions s
      WHERE s.ride_id = $1 AND s.status <> 'ended'
        AND p.session_id = s.id AND p.rider_id = $2`,
    [rideId, riderId, role],
  );
};

/**
 * The rider leaves a ride before it starts; once it is live, they finish
 * their ride instead. A captain hands it to the next leader first, or
 * cancels it when nobody is left.
 */
export const leaveRide = (rideId: string, riderId: string): Promise<LeaveRideOutcome> =>
  inTransaction(async (client) => {
    const ride = await lockRide(client, rideId);
    if (ride.status === "active") throw new RideRosterError("ride_started");
    if (!OPEN_RIDE_STATUSES.includes(ride.status)) throw new RideRosterError("ride_over");
    if (!(await isConfirmedOnRide(client, rideId, riderId))) throw new RideRosterError("not_on_ride");

    const at = new Date();
    let outcome: LeaveRideOutcome = "left";
    if (ride.captain_id === riderId) {
      const successor = pickRideSuccessor(await loadSuccessorCandidates(client, rideId, riderId));
      if (successor) {
        await passRide(client, rideId, riderId, successor, "left", at);
        outcome = "handed_over";
      } else {
        await cancelRide(client, rideId, at);
        outcome = "ride_cancelled";
      }
    }

    await client.query(
      `UPDATE ride_participants SET status = 'dropped_out', role = 'rider', left_at = $3
        WHERE ride_id = $1 AND rider_id = $2`,
      [rideId, riderId, at],
    );
    await syncRiderCounts(client, [rideId]);
    return outcome;
  });

/**
 * The captain hands the ride to another rider on it, before or during the
 * ride, and stays on as a co-captain.
 */
export const passCaptaincy = (rideId: string, captainId: string, toRiderId: string): Promise<void> =>
  inTransaction(async (client) => {
    const ride = await lockRide(client, rideId);
    if (ride.captain_id !== captainId) throw new RideRosterError("not_captain");
    if (!OPEN_RIDE_STATUSES.includes(ride.status)) throw new RideRosterError("ride_over");
    if (toRiderId === captainId) throw new RideRosterError("already_captain");

    // Locked like a hand-over, so the ride never goes to a rider mid-deletion.
    const candidates = await loadSuccessorCandidates(client, rideId, captainId);
    if (!candidates.some((candidate) => candidate.riderId === toRiderId)) {
      throw new RideRosterError("target_not_on_ride");
    }

    await passRide(client, rideId, captainId, toRiderId, "passed_on", new Date());
    await setRole(client, rideId, captainId, "co_captain");
  });

/**
 * Who would lead the ride if its captain left now; null when nobody would.
 * Shown to the captain before they decide.
 */
export const previewNextCaptain = async (
  rideId: string,
  captainId: string,
): Promise<{ rider_id: string; display_name: string } | null> => {
  const successor = pickRideSuccessor(await loadSuccessorCandidates(pool, rideId, captainId, { lock: false }));
  if (!successor) return null;
  const rider = await pool.query(`SELECT display_name FROM riders WHERE id = $1`, [successor]);
  return { rider_id: successor, display_name: (rider.rows[0]?.display_name as string | undefined) ?? "A rider" };
};
