/**
 * Ride now (docs/ride-now-ux.md §7.2): a ride made and set off in one step,
 * with no form and no roll call.
 *
 * It is 'unplanned' and 'solo' (hidden, not joinable) and scheduled for now.
 * Then the rider's own ride starts (which opens the live session and marks
 * them riding, so they can finish it) and the captain rolls out (so the
 * session and the ride are active). Being the only rider, their finish
 * completes the ride: completeGroupIfAllFinished closes an active session.
 *
 * The steps are separate transactions, because they are the same calls a
 * planned ride uses. If starting fails, the ride made for it is removed, so
 * a failed Ride now leaves nothing behind.
 */
import { query } from "../config/db.js";
import type { RideNowInput } from "../schemas/ride.schemas.js";
import { rollOutLiveSession } from "./live-session.service.js";
import { listRidesBeingRidden, startOwnRide } from "./ride-progress.service.js";
import { createRide, getRideById, type Ride } from "./ride.service.js";

/** A rider rides one ride at a time: the phone tracks one. */
export class AlreadyRidingError extends Error {
  constructor(readonly rideId: string) {
    super("You're already on a ride. Finish it before starting another.");
    this.name = "AlreadyRidingError";
  }
}

export interface RideNowResult {
  ride: Ride;
  session: Awaited<ReturnType<typeof rollOutLiveSession>>["session"];
}

export const startRideNow = async (riderId: string, input: RideNowInput): Promise<RideNowResult> => {
  const [riding] = await listRidesBeingRidden(riderId);
  if (riding) throw new AlreadyRidingError(riding.id);

  const created = await createRide(
    riderId,
    {
      ...input,
      status: "scheduled",
      visibility: "private",
      scheduled_at: new Date().toISOString(),
      start_point_auto: false,
    },
    { kind: "unplanned", visibility: "solo" },
  );
  if (!created) throw new Error("Ride now: the ride was not created");

  try {
    await startOwnRide(created.id, riderId);
    const { session } = await rollOutLiveSession(created.id, riderId);
    const ride = await getRideById(created.id, riderId);
    if (!ride) throw new Error("Ride now: the ride vanished after starting");
    return { ride, session };
  } catch (error) {
    // Its session and presence go with it (ON DELETE CASCADE).
    await query(`DELETE FROM rides WHERE id = $1 AND kind = 'unplanned'`, [created.id]).catch((cleanupError) => {
      console.error("Ride now: could not remove the ride after a failed start:", cleanupError);
    });
    throw error;
  }
};
