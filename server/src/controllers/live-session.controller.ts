import type { Request, Response } from "express";
import { z } from "zod";
import { getRiderTrack } from "../services/ride-track.service.js";
import {
  nameAreaWithGoogle,
  previewRouteFromRide,
  saveRouteFromRide,
} from "../services/route-from-ride.service.js";
import { SaveRouteFromRideSchema } from "../schemas/route.schemas.js";
import { GOOGLE_LOOKUPS } from "../services/route-place-lookups.js";
import { RouteTooShortError } from "../services/route-public-view.js";
import {
  CreateIncidentSchema,
  EndLiveSessionSchema,
} from "../schemas/live-session.schemas.js";
import { emitToLiveRoom, incidentCreatedEvent } from "../realtime/gateway.js";
import { buildLiveRoomKey } from "../realtime/session-room.js";
import {
  LiveSessionError,
  UnfinishedRidersError,
  createLiveIncident,
  endLiveSession,
  getLiveSession,
  getLiveLocationDropTelemetry,
  getLiveSessionFoundationStatus,
  startLiveSession,
  rollOutLiveSession,
  acknowledgeLiveIncident,
  getLiveSessionTimeline,
  getLiveSessionReplay,
} from "../services/live-session.service.js";

interface RiderPayload {
  riderId: string;
}

const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

const RideIdSchema = z.string().uuid();

export const handleLiveSessionError = (res: Response, error: any, context: string) => {
  // The client shows these riders to the captain and asks before ending anyway.
  if (error instanceof UnfinishedRidersError) {
    res.status(409).json({ error: error.message, code: "UNFINISHED_RIDERS", riders: error.riders });
    return;
  }

  if (error instanceof LiveSessionError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  // Saved public, a route others would see without its personal ends must
  // have enough left to show.
  if (error instanceof RouteTooShortError) {
    res.status(422).json({ error: error.message, code: "ROUTE_TOO_SHORT" });
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
    const location_drop_telemetry = getLiveLocationDropTelemetry();
    res.json({
      module: "live-session",
      phase: 0,
      status,
      ...(location_drop_telemetry.enabled
        ? { location_drop_telemetry }
        : {}),
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

export const rollOutSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await rollOutLiveSession(req.params.id as string, rid(req));
    res.status(200).json(result);
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error rolling out live session");
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
      confirm_unfinished: data.confirm_unfinished,
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
        endedAt: result.session.ended_at,
        endedBy: result.session.ended_by,
        reason: result.session.ended_reason ?? data.reason ?? null,
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
    const rideId = req.params.id as string;
    const incident = await createLiveIncident(rideId, rid(req), data);
    // Sent over HTTP when the rider is not in the room; the room still hears it.
    emitToLiveRoom(
      buildLiveRoomKey(rideId, incident.session_id as string),
      "incident:created",
      incidentCreatedEvent(incident, rid(req), data),
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
    if (typeof req.query.cursor === "string") opts.cursor = req.query.cursor;
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

/** What saving the caller's ride as a route would produce, for the save sheet. */
export const previewRouteFromMyRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = RideIdSchema.parse(req.params.id);
    res.json(await previewRouteFromRide(rideId, rid(req), { nameArea: nameAreaWithGoogle }));
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error previewing ride as a route");
  }
};

/** Publishes the caller's own track on a completed ride as a route. */
export const saveRouteFromMyRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = RideIdSchema.parse(req.params.id);
    const input = SaveRouteFromRideSchema.parse(req.body ?? {});
    const { route, created } = await saveRouteFromRide(rideId, rid(req), input, {
      nameArea: nameAreaWithGoogle,
      publicPlaces: GOOGLE_LOOKUPS,
    });
    res.status(created ? 201 : 200).json({ route, created });
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error saving ride as a route");
  }
};

export const getTrack = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = RideIdSchema.parse(req.params.id);
    res.json(await getRiderTrack(rideId, rid(req)));
  } catch (error: any) {
    handleLiveSessionError(res, error, "Error fetching rider track");
  }
};
