import type { Request, Response } from "express";
import {
  CreateIncidentSchema,
  EndLiveSessionSchema,
} from "../schemas/live-session.schemas.js";
import { emitToLiveRoom } from "../realtime/gateway.js";
import { buildLiveRoomKey } from "../realtime/session-room.js";
import {
  LiveSessionError,
  createLiveIncident,
  endLiveSession,
  getLiveSession,
  getLiveSessionFoundationStatus,
  startLiveSession,
  acknowledgeLiveIncident,
  getLiveSessionTimeline,
  getLiveSessionReplay,
} from "../services/live-session.service.js";

interface RiderPayload {
  riderId: string;
  email: string;
}

const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

const handleLiveSessionError = (res: Response, error: any, context: string) => {
  if (error instanceof LiveSessionError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  if (error?.name === "ZodError") {
    res.status(400).json({ errors: error.issues });
    return;
  }

  console.error(`${context}:`, error);
  res.status(500).json({ error: "Internal server error" });
};

export const getFoundationStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const status = await getLiveSessionFoundationStatus();
    res.json({
      module: "live-session",
      phase: 0,
      status,
    });
  } catch (error: any) {
    console.error("Error checking live-session foundation status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const startSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await startLiveSession(req.params.id as string, rid(req));
    res.status(result.started ? 201 : 200).json(result);
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error starting live session");
  }
};

export const getSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const session = await getLiveSession(req.params.id as string, rid(req));
    res.json({ session });
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error fetching live session");
  }
};

export const endSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = EndLiveSessionSchema.parse(req.body || {});
    const options = {
      mark_ride_completed: data.mark_ride_completed,
      ...(data.reason ? { reason: data.reason } : {}),
    };
    const result = await endLiveSession(
      req.params.id as string,
      rid(req),
      options,
    );

    if (result.ended && result.session) {
      const roomKey = buildLiveRoomKey(
        result.session.ride_id,
        result.session.id,
      );
      emitToLiveRoom(roomKey, "session:ended", {
        rideId: result.session.ride_id,
        sessionId: result.session.id,
        reason: data.reason ?? null,
      });
    }

    res.json(result);
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error ending live session");
  }
};

export const reportIncident = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = CreateIncidentSchema.parse(req.body);
    const incident = await createLiveIncident(
      req.params.id as string,
      rid(req),
      data,
    );
    res.status(201).json({ incident });
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error creating live incident");
  }
};

export const acknowledgeIncident = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const incident = await acknowledgeLiveIncident(
      req.params.id as string,
      req.params.incidentId as string,
      rid(req),
    );
    res.json({ incident });
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error acknowledging live incident");
  }
};

// ── Timeline ─────────────────────────────────────────────────────────────────

export const getTimeline = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await getLiveSessionTimeline(
      req.params.id as string,
      rid(req),
    );
    res.json(result);
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error fetching live session timeline");
  }
};

// ── Replay ────────────────────────────────────────────────────────────────────

export const getReplay = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const opts: import("../services/live-session.service.js").ReplayOptions = {};
    if (req.query.limit) opts.limit = Number(req.query.limit);
    if (req.query.cursor) opts.cursor = Number(req.query.cursor);
    if (typeof req.query.from === "string") opts.fromTs = req.query.from;
    if (typeof req.query.to === "string") opts.toTs = req.query.to;

    const result = await getLiveSessionReplay(
      req.params.id as string,
      rid(req),
      opts,
    );
    res.json(result);
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error fetching live session replay");
  }
};
