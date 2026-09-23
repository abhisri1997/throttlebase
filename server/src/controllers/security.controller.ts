import type { Request, Response } from "express";
import * as SecurityService from "../services/security.service.js";

interface RiderPayload {
  riderId: string;
}
const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

// ── Login Activity ────────────────────────────────────────────────────────────

/**
 * GET /api/security/login-activity
 */
export const handleGetLoginActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
    const activity = await SecurityService.getLoginActivity(rid(req), limit);
    res.json({ activity });
  } catch (e: any) {
    console.error("Login activity error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Sessions ──────────────────────────────────────────────────────────────────

/**
 * GET /api/security/sessions
 */
export const handleGetSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await SecurityService.getActiveSessions(rid(req));
    res.json({ sessions });
  } catch (e: any) {
    console.error("Sessions error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/security/sessions/:id
 */
export const handleRevokeSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await SecurityService.revokeSession(req.params.id as string, rid(req));
    if (!ok) {
      res.status(404).json({ error: "Session not found or already revoked" });
      return;
    }
    res.json({ message: "Session revoked" });
  } catch (e: any) {
    console.error("Revoke session error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/security/sessions  (revoke all)
 */
export const handleRevokeAllSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await SecurityService.revokeAllSessions(rid(req));
    res.json({ message: `${count} session(s) revoked` });
  } catch (e: any) {
    console.error("Revoke all sessions error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
