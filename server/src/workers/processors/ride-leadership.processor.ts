/**
 * Ride Leadership Processor
 *
 * Handles `ride.leader_changed` jobs, queued in the same transaction that
 * hands a ride to a new captain (services/ride-roster.service.ts). Tells the
 * new captain they lead the ride now, and everyone else still on it who
 * does. Safe to run twice: each rider is told once per new captain.
 */

import { query } from "../../config/db.js";
import { createNotificationsForRiders } from "../../services/notifications.service.js";

const NOTIFICATION_TYPE = "ride_captain_changed";

interface RideForNotice {
  title: string | null;
  captain_id: string;
  captain_name: string | null;
}

const loadRide = async (rideId: string): Promise<RideForNotice | null> => {
  const result = await query(
    `SELECT r.title, r.captain_id::text AS captain_id, c.display_name AS captain_name
       FROM rides r JOIN riders c ON c.id = r.captain_id
      WHERE r.id = $1`,
    [rideId],
  );
  return (result.rows[0] as RideForNotice | undefined) ?? null;
};

/** Everyone still on the ride whose account exists. */
const loadRiders = async (rideId: string): Promise<string[]> => {
  const result = await query(
    `SELECT p.rider_id::text AS rider_id
       FROM ride_participants p JOIN riders r ON r.id = p.rider_id
      WHERE p.ride_id = $1 AND p.status = 'confirmed' AND r.deleted_at IS NULL`,
    [rideId],
  );
  return result.rows.map((row) => row.rider_id as string);
};

const riderName = async (riderId: unknown): Promise<string | null> => {
  if (typeof riderId !== "string") return null;
  const result = await query(`SELECT display_name FROM riders WHERE id = $1 AND deleted_at IS NULL`, [riderId]);
  return (result.rows[0]?.display_name as string | undefined) ?? null;
};

/** Why the captain changed, in words for the notification. */
const describeChange = async (payload: Record<string, unknown>): Promise<string> => {
  if (payload.reason === "passed_on") {
    return `${(await riderName(payload.previousCaptainId)) ?? "The previous captain"} handed the ride over`;
  }
  if (payload.reason === "left") return "The previous captain left the ride";
  return "The previous captain left ThrottleBase";
};

const requireString = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required for ride.leader_changed job`);
  }
  return value;
};

export const processRideLeaderChanged = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const rideId = requireString(payload, "rideId");
  const newCaptainId = requireString(payload, "newCaptainId");

  const ride = await loadRide(rideId);
  // Deleted since, or passed on again: a later job speaks for the ride.
  if (!ride || ride.captain_id !== newCaptainId) {
    return { processor: "ride-leadership", rideId, skipped: ride ? "captain_changed_again" : "ride_not_found" };
  }

  const rideLabel = ride.title || "your ride";
  const captainName = ride.captain_name || "Another rider";
  const why = await describeChange(payload);
  // One notice per change: a retried job is not told twice, but being made
  // captain again later is a new change.
  const changedAt = typeof payload.at === "string" ? payload.at : "";
  const shared = {
    type: NOTIFICATION_TYPE,
    data: { ride_id: rideId, event: "ride.captain_changed" },
    dedupeKey: `${NOTIFICATION_TYPE}:${rideId}:${newCaptainId}:${changedAt}`,
  };

  const toCaptain = await createNotificationsForRiders({
    ...shared,
    riderIds: [newCaptainId],
    title: `You're now the captain of ${rideLabel}`,
    body: `${why}, so you lead this ride now and receive its group alerts.`,
  });

  const riders = (await loadRiders(rideId)).filter((riderId) => riderId !== newCaptainId);
  const toRiders = await createNotificationsForRiders({
    ...shared,
    riderIds: riders,
    title: `${captainName} is now the captain of ${rideLabel}`,
    body: `${why}. ${captainName} leads the ride now.`,
  });

  return {
    processor: "ride-leadership",
    rideId,
    notified: (toCaptain.inserted ?? 0) + (toRiders.inserted ?? 0),
    handledAt: new Date().toISOString(),
  };
};
