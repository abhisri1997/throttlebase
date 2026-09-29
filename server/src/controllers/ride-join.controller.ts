import type { Request, Response } from "express";
import { z } from "zod";
import { AnswerJoinRequestSchema, JoinRideSchema } from "../schemas/ride.schemas.js";
import {
  answerJoinRequest as answerRequest,
  cancelJoinRequest as cancelRequest,
  joinOrRequestRide,
  RideJoinError,
  type JoinOutcome,
  type RideJoinRefusal,
} from "../services/ride-join.service.js";
import { emitToRideRoom } from "../realtime/gateway.js";

interface RiderPayload {
  riderId: string;
}

const IdSchema = z.string().uuid();

const riderIdOf = (req: Request): string => (req.rider as unknown as RiderPayload).riderId;

const REFUSAL_STATUS: Readonly<Record<RideJoinRefusal, number>> = {
  not_found: 404,
  not_joinable: 400,
  full: 400,
  already_on_ride: 400,
  already_requested: 409,
  declined: 403,
  not_leader: 403,
  no_request: 404,
};

const JOIN_MESSAGES: Readonly<Record<JoinOutcome, string>> = {
  joined: "Successfully joined the ride",
  requested: "Request sent: the captain or a co-captain will accept or decline it",
};

const handleError = (res: Response, error: unknown, action: string): void => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", details: error.issues });
    return;
  }
  if (error instanceof RideJoinError) {
    res.status(REFUSAL_STATUS[error.kind]).json({ error: error.message });
    return;
  }
  console.error(`Error ${action}:`, error);
  res.status(500).json({ error: "Internal server error" });
};

/** Joins a public ride, or asks to join one that needs approval. */
export const joinRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = riderIdOf(req);
    const rideId = IdSchema.parse(req.params.id);
    const { location_coords: startLocation } = JoinRideSchema.parse(req.body ?? {});

    const outcome = await joinOrRequestRide(rideId, riderId, startLocation);
    // Riders on the ride see a new rider; leaders see a new request.
    emitToRideRoom(rideId, outcome === "joined" ? "ride:joined" : "ride:roster_changed", { rideId, riderId });
    res.json({ message: JOIN_MESSAGES[outcome], outcome });
  } catch (error) {
    handleError(res, error, "joining ride");
  }
};

/** The rider withdraws their request to join. */
export const cancelJoinRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = IdSchema.parse(req.params.id);
    await cancelRequest(rideId, riderIdOf(req));
    emitToRideRoom(rideId, "ride:roster_changed", { rideId });
    res.json({ message: "Request withdrawn" });
  } catch (error) {
    handleError(res, error, "withdrawing a request to join");
  }
};

/** The captain or a co-captain accepts or declines a request to join. */
export const answerJoinRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = IdSchema.parse(req.params.id);
    const requesterId = IdSchema.parse(req.params.riderId);
    const { accept } = AnswerJoinRequestSchema.parse(req.body ?? {});

    await answerRequest(rideId, riderIdOf(req), requesterId, accept);
    emitToRideRoom(rideId, "ride:roster_changed", { rideId });
    res.json({ message: accept ? "Rider accepted" : "Request declined" });
  } catch (error) {
    handleError(res, error, "answering a request to join");
  }
};
