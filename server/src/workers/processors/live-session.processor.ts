import { query } from "../../config/db.js";
import { createNotificationsForRiders } from "../../services/notifications.service.js";

type RideDetails = {
  ride_id: string;
  ride_title: string;
  session_id: string | null;
  session_status: string | null;
};

const getRideDetails = async (rideId: string): Promise<RideDetails | null> => {
  const result = await query(
    `SELECT r.id AS ride_id,
            r.title AS ride_title,
            s.id AS session_id,
            s.status AS session_status
     FROM rides r
     LEFT JOIN ride_live_sessions s ON s.ride_id = r.id
     WHERE r.id = $1`,
    [rideId],
  );

  return (result.rows[0] as RideDetails | undefined) ?? null;
};

const getRideRecipientIds = async (rideId: string): Promise<string[]> => {
  const result = await query(
    `SELECT rider_id::text AS rider_id
     FROM (
       SELECT r.captain_id AS rider_id
       FROM rides r
       WHERE r.id = $1
       UNION
       SELECT rp.rider_id
       FROM ride_participants rp
       WHERE rp.ride_id = $1
         AND rp.status = 'confirmed'
     ) recipients`,
    [rideId],
  );

  return result.rows.map((row) => row.rider_id as string);
};

const getRiderName = async (riderId: string | null): Promise<string | null> => {
  if (!riderId) {
    return null;
  }

  const result = await query(
    `SELECT display_name
     FROM riders
     WHERE id = $1`,
    [riderId],
  );

  return (result.rows[0]?.display_name as string | undefined) ?? null;
};

export const processLiveSessionStarted = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const rideId =
    typeof payload.rideId === "string" && payload.rideId.length > 0
      ? payload.rideId
      : null;

  if (!rideId) {
    throw new Error("rideId is required for live_session.started job");
  }

  const actorRiderId =
    typeof payload.actorRiderId === "string" && payload.actorRiderId.length > 0
      ? payload.actorRiderId
      : null;

  const rideDetails = await getRideDetails(rideId);
  if (!rideDetails) {
    throw new Error(`Ride ${rideId} not found for live_session.started job`);
  }

  if (!rideDetails.session_id) {
    throw new Error(
      `Live session missing for ride ${rideId} in live_session.started job`,
    );
  }

  const recipientIds = (await getRideRecipientIds(rideId)).filter(
    (riderId) => riderId !== actorRiderId,
  );

  const actorName = await getRiderName(actorRiderId);
  const actorLabel = actorName ?? "A ride leader";
  const rideLabel = rideDetails.ride_title || "the ride";

  const notificationOutcome = await createNotificationsForRiders({
    riderIds: recipientIds,
    type: "live_session_started",
    title: "Live session started",
    body: `${actorLabel} started live tracking for ${rideLabel}.`,
    data: {
      ride_id: rideId,
      session_id: rideDetails.session_id,
      actor_rider_id: actorRiderId,
      event: "live_session.started",
    },
    dedupeKey: `live_session_started:${rideDetails.session_id}`,
  });

  return {
    processor: "live-session-started",
    rideId,
    actorRiderId,
    sessionId: rideDetails.session_id,
    notificationOutcome,
    handledAt: new Date().toISOString(),
  };
};

export const processLiveSessionEnded = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const rideId =
    typeof payload.rideId === "string" && payload.rideId.length > 0
      ? payload.rideId
      : null;

  if (!rideId) {
    throw new Error("rideId is required for live_session.ended job");
  }

  const actorRiderId =
    typeof payload.actorRiderId === "string" && payload.actorRiderId.length > 0
      ? payload.actorRiderId
      : null;
  const reason =
    typeof payload.reason === "string" && payload.reason.length > 0
      ? payload.reason
      : null;

  const rideDetails = await getRideDetails(rideId);
  if (!rideDetails) {
    throw new Error(`Ride ${rideId} not found for live_session.ended job`);
  }

  if (!rideDetails.session_id) {
    throw new Error(
      `Live session missing for ride ${rideId} in live_session.ended job`,
    );
  }

  const recipientIds = (await getRideRecipientIds(rideId)).filter(
    (riderId) => riderId !== actorRiderId,
  );
  const actorName = await getRiderName(actorRiderId);
  const actorLabel = actorName ?? "A ride leader";
  const rideLabel = rideDetails.ride_title || "the ride";

  const body = reason
    ? `${actorLabel} ended live tracking for ${rideLabel}. Reason: ${reason}.`
    : `${actorLabel} ended live tracking for ${rideLabel}.`;

  const notificationOutcome = await createNotificationsForRiders({
    riderIds: recipientIds,
    type: "live_session_ended",
    title: "Live session ended",
    body,
    data: {
      ride_id: rideId,
      session_id: rideDetails.session_id,
      actor_rider_id: actorRiderId,
      reason,
      event: "live_session.ended",
    },
    dedupeKey: `live_session_ended:${rideDetails.session_id}`,
  });

  return {
    processor: "live-session-ended",
    rideId,
    actorRiderId,
    reason,
    sessionId: rideDetails.session_id,
    notificationOutcome,
    handledAt: new Date().toISOString(),
  };
};
