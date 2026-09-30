import type { Request, Response } from "express";
import { ModerationActionSchema } from "../schemas/moderation.schemas.js";
import { listQueue, listSuspended, ModerationError, takeAction } from "../services/moderation.service.js";

const rid = (req: Request): string => req.rider!.riderId;

export const queue = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ items: await listQueue() });
  } catch (error) {
    console.error("Error listing the moderation queue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const suspended = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ riders: await listSuspended() });
  } catch (error) {
    console.error("Error listing suspended riders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const act = async (req: Request, res: Response): Promise<void> => {
  const parsed = ModerationActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const outcome = await takeAction(rid(req), parsed.data);
    res.json({
      action: outcome.action,
      reports_closed: outcome.reportsClosed,
      notified: outcome.notified,
    });
  } catch (error) {
    if (error instanceof ModerationError) {
      res.status(error.kind === "not_found" ? 404 : 400).json({ error: error.message, code: error.kind });
      return;
    }
    console.error("Error taking a moderation action:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
