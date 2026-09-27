import type { Request, Response } from "express";
import { z } from "zod";
import { RoadFeedbackSchema } from "../schemas/roadFeedback.schemas.js";
import {
  getRoadFeedbackPrompt,
  RoadFeedbackNotAllowedError,
  saveRoadFeedback,
  type RoadFeedbackRefusal,
} from "../services/road-feedback.service.js";

interface RiderPayload {
  riderId: string;
}

const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

const RideIdSchema = z.string().uuid();

const REFUSAL_STATUS: Readonly<Record<RoadFeedbackRefusal, number>> = {
  not_found: 404,
  not_a_rider: 403,
  not_finished: 409,
  no_road: 409,
};

const handleError = (res: Response, error: unknown, context: string): void => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", details: error.issues });
  } else if (error instanceof RoadFeedbackNotAllowedError) {
    res.status(REFUSAL_STATUS[error.kind]).json({ error: error.message });
  } else {
    console.error(`${context}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** Whether the caller is asked how the road was on this ride, and their answer so far. */
export const getRoadFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const prompt = await getRoadFeedbackPrompt(RideIdSchema.parse(req.params.id), rid(req));
    if (!prompt) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }
    res.json(prompt);
  } catch (error) {
    handleError(res, error, "Error reading road feedback");
  }
};

/** Records (or replaces) the caller's answer to "Was the road as described?" */
export const putRoadFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = RideIdSchema.parse(req.params.id);
    const input = RoadFeedbackSchema.parse(req.body ?? {});
    res.json({ feedback: await saveRoadFeedback(rideId, rid(req), input) });
  } catch (error) {
    handleError(res, error, "Error saving road feedback");
  }
};
