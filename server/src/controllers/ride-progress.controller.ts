/**
 * A rider's own ride within a group ride: start early, finish, take it back.
 * Every change is pushed to the ride's live room so the whole group's roster
 * — who is riding, arrived, or left early — stays current.
 */
import type { Request, Response } from "express";
import { emitToLiveRoom } from "../realtime/gateway.js";
import { buildLiveRoomKey } from "../realtime/session-room.js";
import {
  finishOwnRide,
  listRidesBeingRidden,
  resumeOwnRide,
  startOwnRide,
} from "../services/ride-progress.service.js";
import { handleLiveSessionError } from "./live-session.controller.js";

interface RiderPayload {
  riderId: string;
}

interface SessionRef {
  id: string;
  ride_id: string;
  status: string;
  ended_at: string | null;
  ended_by: string | null;
  ended_reason: string | null;
}

const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

/** Tells the room a rider's progress changed; clients refetch the roster. */
const emitRiderProgress = (session: SessionRef | null, riderId: string, progress: string): void => {
  if (!session) return;
  emitToLiveRoom(buildLiveRoomKey(session.ride_id, session.id), "rider:progress", {
    rideId: session.ride_id,
    riderId,
    progress,
  });
};

const emitSessionEnded = (session: SessionRef): void => {
  emitToLiveRoom(buildLiveRoomKey(session.ride_id, session.id), "session:ended", {
    rideId: session.ride_id,
    sessionId: session.id,
    endedAt: session.ended_at,
    endedBy: session.ended_by,
    reason: session.ended_reason,
  });
};

export const getRidesImRiding = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ rides: await listRidesBeingRidden(rid(req)) });
  } catch (error: unknown) {
    handleLiveSessionError(res, error, "Error listing rides being ridden");
  }
};

export const startMyRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = rid(req);
    const result = await startOwnRide(req.params.id as string, riderId);
    emitRiderProgress(result.session, riderId, "riding");
    res.status(result.openedSession ? 201 : 200).json(result);
  } catch (error: unknown) {
    handleLiveSessionError(res, error, "Error starting rider's own ride");
  }
};

export const finishMyRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = rid(req);
    const result = await finishOwnRide(req.params.id as string, riderId);

    if (!result.alreadyFinished) {
      emitRiderProgress(result.session, riderId, result.reason);
    }
    if (result.closedSession) {
      emitSessionEnded(result.closedSession);
    }

    res.json({
      reason: result.reason,
      already_finished: result.alreadyFinished,
      ride_completed: result.closedSession !== null,
      session: result.session,
    });
  } catch (error: unknown) {
    handleLiveSessionError(res, error, "Error finishing rider's own ride");
  }
};

export const resumeMyRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = rid(req);
    const result = await resumeOwnRide(req.params.id as string, riderId);
    emitRiderProgress(result.session, riderId, "riding");
    res.json(result);
  } catch (error: unknown) {
    handleLiveSessionError(res, error, "Error resuming rider's own ride");
  }
};
