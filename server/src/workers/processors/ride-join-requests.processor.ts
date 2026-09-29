/**
 * Ride Join Request Processor
 *
 * Handles the jobs queued with requests to join a ride that needs approval
 * (services/ride-join.service.ts), in the same transaction as the request
 * or its answer:
 *
 *   * `ride.join_requested` tells the captain and co-captains someone asked.
 *   * `ride.join_answered` tells the rider whether they're in.
 *
 * Safe to run twice. Leaders hear of a rider once per chance to ask (a
 * first ask, and one more after a decline), however often the rider
 * withdraws and asks again; the rider hears of each answer once.
 */

import { query } from "../../config/db.js";
import { MAX_DECLINES } from "../../core/rides/joinRequest.js";
import { createNotificationsForRiders } from "../../services/notifications.service.js";

const REQUESTED_TYPE = "ride_join_requested";
const ANSWERED_TYPE = "ride_join_answered";

const requireString = (payload: Record<string, unknown>, key: string, job: string): string => {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required for ${job} job`);
  }
  return value;
};

const rideTitle = async (rideId: string): Promise<string | null> => {
  const result = await query(`SELECT title FROM rides WHERE id = $1`, [rideId]);
  if (result.rows.length === 0) return null;
  return (result.rows[0].title as string | null) || "your ride";
};

interface Seat {
  status: string;
  declineCount: number;
  name: string | null;
}

/** The rider's seat on the ride now, if their account still exists. */
const loadSeat = async (rideId: string, riderId: string): Promise<Seat | null> => {
  const result = await query(
    `SELECT p.status, p.decline_count, r.display_name
       FROM ride_participants p JOIN riders r ON r.id = p.rider_id
      WHERE p.ride_id = $1 AND p.rider_id = $2 AND r.deleted_at IS NULL`,
    [rideId, riderId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    status: row.status as string,
    declineCount: Number(row.decline_count),
    name: (row.display_name as string | null) ?? null,
  };
};

/** The captain and co-captains, whose accounts still exist. */
const loadLeaders = async (rideId: string): Promise<string[]> => {
  const result = await query(
    `SELECT r.captain_id::text AS rider_id FROM rides r
       JOIN riders c ON c.id = r.captain_id
      WHERE r.id = $1 AND c.deleted_at IS NULL
     UNION
     SELECT p.rider_id::text FROM ride_participants p
       JOIN riders u ON u.id = p.rider_id
      WHERE p.ride_id = $1 AND p.status = 'confirmed' AND p.role = 'co_captain' AND u.deleted_at IS NULL`,
    [rideId],
  );
  return result.rows.map((row) => row.rider_id as string);
};

const at = (payload: Record<string, unknown>): string => (typeof payload.at === "string" ? payload.at : "");

export const processRideJoinRequested = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const job = "ride.join_requested";
  const rideId = requireString(payload, "rideId", job);
  const riderId = requireString(payload, "riderId", job);

  const title = await rideTitle(rideId);
  if (!title) return { processor: "ride-join-requests", rideId, skipped: "ride_not_found" };
  // Withdrawn or answered already: nothing left for the leaders to do.
  const seat = await loadSeat(rideId, riderId);
  if (!seat || seat.status !== "requested") {
    return { processor: "ride-join-requests", rideId, skipped: "request_not_waiting" };
  }

  const leaders = await loadLeaders(rideId);
  const notified = await createNotificationsForRiders({
    riderIds: leaders,
    type: REQUESTED_TYPE,
    title: `${seat.name || "A rider"} asked to join ${title}`,
    body: "Accept or decline the request on the ride page.",
    data: { ride_id: rideId, rider_id: riderId, event: job },
    dedupeKey: `${REQUESTED_TYPE}:${rideId}:${riderId}:${seat.declineCount}`,
  });

  return { processor: "ride-join-requests", rideId, notified: notified.inserted ?? 0 };
};

/** What the rider is told, accepted or declined. */
const answerText = (title: string, accepted: boolean, declineCount: number): { title: string; body: string } => {
  if (accepted) {
    return {
      title: `You're in: ${title}`,
      body: "Your request to join was accepted. The meeting point and route are on the ride page.",
    };
  }
  return {
    title: `Request declined: ${title}`,
    body:
      declineCount < MAX_DECLINES
        ? "Your request to join was declined. You can ask once more."
        : "Your request to join was declined.",
  };
};

export const processRideJoinAnswered = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const job = "ride.join_answered";
  const rideId = requireString(payload, "rideId", job);
  const riderId = requireString(payload, "riderId", job);
  const accepted = payload.accepted === true;
  const declineCount = Number(payload.declineCount ?? 0);

  const title = await rideTitle(rideId);
  if (!title) return { processor: "ride-join-requests", rideId, skipped: "ride_not_found" };
  if (!(await loadSeat(rideId, riderId))) {
    return { processor: "ride-join-requests", rideId, skipped: "rider_not_found" };
  }

  const text = answerText(title, accepted, declineCount);
  const notified = await createNotificationsForRiders({
    riderIds: [riderId],
    type: ANSWERED_TYPE,
    ...text,
    data: { ride_id: rideId, event: job, accepted },
    dedupeKey: `${ANSWERED_TYPE}:${rideId}:${riderId}:${at(payload)}`,
  });

  return { processor: "ride-join-requests", rideId, notified: notified.inserted ?? 0 };
};
