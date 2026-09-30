import type { Request, Response } from "express";
import { ConsentAnswerSchema, ConsentPurposeParam, DeclarationSchema } from "../schemas/consent.schemas.js";
import {
  ConsentError,
  getConsentOverview,
  recordConsent,
  recordDeclaration,
} from "../services/consent.service.js";
import { stopSharingLiveLocation } from "../services/live-session.service.js";
import { endLiveLocationSharing } from "../realtime/gateway.js";

const rid = (req: Request): string => req.rider!.riderId;

/**
 * What a withdrawal stops straight away. The gates already refuse the
 * rider's next update; this makes the others stop seeing them now, rather
 * than when their last position goes stale. A failure here leaves the
 * withdrawal recorded and the gate closed, so it is logged, not returned.
 */
const applyWithdrawal = async (riderId: string, purpose: string): Promise<void> => {
  if (purpose !== "live_location_sharing") return;
  try {
    endLiveLocationSharing(riderId, await stopSharingLiveLocation(riderId));
  } catch (error) {
    console.error("Error stopping live location after a withdrawal:", error);
  }
};

const refused = (res: Response, error: ConsentError): void => {
  // A stale notice means the app must fetch the new text and ask again.
  res.status(error.kind === "stale_notice" ? 409 : 403).json({ error: error.message, code: error.kind });
};

export const overview = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getConsentOverview(rid(req)));
  } catch (error) {
    console.error("Error reading consents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const answer = async (req: Request, res: Response): Promise<void> => {
  const purpose = ConsentPurposeParam.safeParse(req.params.purpose);
  if (!purpose.success) {
    res.status(404).json({ error: "Unknown consent purpose", code: "unknown_purpose" });
    return;
  }
  const parsed = ConsentAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const outcome = await recordConsent(rid(req), {
      purpose: purpose.data,
      granted: parsed.data.granted,
      noticeVersion: parsed.data.notice_version,
      source: parsed.data.source,
      appVersion: parsed.data.app_version ?? null,
      platform: parsed.data.platform ?? null,
    });
    if (outcome.changed && !parsed.data.granted) {
      await applyWithdrawal(rid(req), purpose.data);
    }
    res.json({ changed: outcome.changed, consents: outcome.consents });
  } catch (error) {
    if (error instanceof ConsentError) {
      refused(res, error);
      return;
    }
    console.error("Error recording consent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const declare = async (req: Request, res: Response): Promise<void> => {
  const parsed = DeclarationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    await recordDeclaration(rid(req), {
      kind: parsed.data.kind,
      answer: parsed.data.answer,
      source: parsed.data.source,
      appVersion: parsed.data.app_version ?? null,
    });
    res.status(201).json({ kind: parsed.data.kind, answer: parsed.data.answer });
  } catch (error) {
    if (error instanceof ConsentError) {
      refused(res, error);
      return;
    }
    console.error("Error recording a declaration:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
