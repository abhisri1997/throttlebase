/**
 * "Was the road as described?" — asked of the riders on a finished ride that
 * followed a saved route's road, and summed up on the route, so the next
 * rider can weigh the saver's highlights against how the road really was.
 */
import { query } from "../config/db.js";
import type { RoadFeedbackInput, RoadFeedbackReason } from "../schemas/roadFeedback.schemas.js";

export type RoadFeedbackRefusal = "not_found" | "not_a_rider" | "not_finished" | "no_road";

const REFUSAL_MESSAGES: Readonly<Record<RoadFeedbackRefusal, string>> = {
  not_found: "Ride not found",
  not_a_rider: "Only riders on this ride can say how the road was",
  not_finished: "The road can be rated once the ride is over",
  no_road: "This ride didn't follow a saved route's road",
};

export class RoadFeedbackNotAllowedError extends Error {
  constructor(readonly kind: RoadFeedbackRefusal) {
    super(REFUSAL_MESSAGES[kind]);
    this.name = "RoadFeedbackNotAllowedError";
  }
}

export interface RoadFeedback {
  as_described: boolean;
  reasons: RoadFeedbackReason[];
  note: string | null;
}

export interface RoadFeedbackPrompt {
  can_answer: boolean;
  route_id: string | null;
  route_title: string | null;
  /** This rider's answer, if they have given one. */
  feedback: RoadFeedback | null;
}

export interface RouteRoadFeedback {
  /** Riders who said the road was as described. */
  described: number;
  total: number;
  /** What was different, most often said first. */
  reasons: { reason: RoadFeedbackReason; count: number }[];
}

interface RideForFeedback {
  status: string;
  route_id: string | null;
  route_title: string | null;
  followed_road: boolean;
  is_rider: boolean;
}

const loadRide = async (rideId: string, riderId: string): Promise<RideForFeedback | null> => {
  const result = await query(
    `SELECT r.status, r.route_id, rt.title AS route_title,
            r.road_via IS NOT NULL AS followed_road,
            EXISTS (
              SELECT 1 FROM ride_participants p
              WHERE p.ride_id = r.id AND p.rider_id = $2 AND p.status = 'confirmed'
            ) AS is_rider
     FROM rides r
     LEFT JOIN routes rt ON rt.id = r.route_id
     WHERE r.id = $1`,
    [rideId, riderId],
  );
  return (result.rows[0] as RideForFeedback | undefined) ?? null;
};

/** Why this rider can't answer for this ride, or null when they can. */
const refusalFor = (ride: RideForFeedback | null): RoadFeedbackRefusal | null => {
  if (!ride) return "not_found";
  if (!ride.is_rider) return "not_a_rider";
  if (ride.status !== "completed") return "not_finished";
  // A deleted route has nobody left to tell.
  if (!ride.followed_road || !ride.route_id) return "no_road";
  return null;
};

/** Whether to ask this rider, and what they said if they already answered. Null for a ride that doesn't exist. */
export const getRoadFeedbackPrompt = async (rideId: string, riderId: string): Promise<RoadFeedbackPrompt | null> => {
  const ride = await loadRide(rideId, riderId);
  if (!ride) return null;

  const mine = await query(
    `SELECT as_described, reasons, note FROM route_road_feedback WHERE ride_id = $1 AND rider_id = $2`,
    [rideId, riderId],
  );

  return {
    can_answer: refusalFor(ride) === null,
    route_id: ride.route_id,
    route_title: ride.route_title,
    feedback: (mine.rows[0] as RoadFeedback | undefined) ?? null,
  };
};

/** Records this rider's answer, replacing any earlier one. */
export const saveRoadFeedback = async (
  rideId: string,
  riderId: string,
  input: RoadFeedbackInput,
): Promise<RoadFeedback> => {
  const ride = await loadRide(rideId, riderId);
  const refusal = refusalFor(ride);
  if (refusal) throw new RoadFeedbackNotAllowedError(refusal);

  const result = await query(
    `INSERT INTO route_road_feedback (route_id, ride_id, rider_id, as_described, reasons, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ride_id, rider_id) DO UPDATE
       SET as_described = EXCLUDED.as_described,
           reasons = EXCLUDED.reasons,
           note = EXCLUDED.note,
           updated_at = now()
     RETURNING as_described, reasons, note`,
    [ride!.route_id, rideId, riderId, input.as_described, input.reasons, input.note],
  );
  return result.rows[0] as RoadFeedback;
};

/** How every ride on this route's road found it. */
export const getRouteRoadFeedback = async (routeId: string): Promise<RouteRoadFeedback> => {
  const [counts, reasons] = await Promise.all([
    query(
      `SELECT count(*) FILTER (WHERE as_described)::int AS described, count(*)::int AS total
       FROM route_road_feedback WHERE route_id = $1`,
      [routeId],
    ),
    query(
      `SELECT reason, count(*)::int AS count
       FROM route_road_feedback, unnest(reasons) AS reason
       WHERE route_id = $1
       GROUP BY reason
       ORDER BY count DESC, reason`,
      [routeId],
    ),
  ]);
  const { described, total } = counts.rows[0] as { described: number; total: number };
  return { described, total, reasons: reasons.rows as RouteRoadFeedback["reasons"] };
};
