import type { Request, Response } from "express";
import { VerifyTotpSchema, DisableTotpSchema } from "../schemas/security.schemas.js";
import * as SecurityService from "../services/security.service.js";

interface RiderPayload { riderId: string; email: string }
const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

// ── 2FA / TOTP ────────────────────────────────────────────────────────────────

/**
 * GET /auth/2fa/status
 * Returns current 2FA enablement status.
 */
export const handleTotpStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await SecurityService.getTotpStatus(rid(req));
    res.json(status);
  } catch (e: any) {
    console.error("2FA status error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /auth/2fa/setup
 * Generates a TOTP secret and returns the otpauth URL for QR scanning.
 */
export const handleTotpSetup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { secret, otpauthUrl } = await SecurityService.setupTotp(rid(req));
    res.json({ secret, otpauthUrl });
  } catch (e: any) {
    console.error("2FA setup error:", e.message);
    if (e.message === "Rider not found") {
      res.status(404).json({ error: "Rider not found" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /auth/2fa/verify
 * Verifies a TOTP token and enables 2FA on success.
 */
export const handleTotpVerify = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = VerifyTotpSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.issues });
      return;
    }
    await SecurityService.verifyTotp(rid(req), parseResult.data.token);
    res.json({ message: "2FA enabled successfully" });
  } catch (e: any) {
    if (e.message === "Invalid TOTP token") {
      res.status(400).json({ error: "Invalid TOTP token" });
      return;
    }
    if (e.message?.includes("setup not initiated")) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error("2FA verify error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /auth/2fa/disable
 * Disables 2FA after password + TOTP confirmation.
 */
export const handleTotpDisable = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = DisableTotpSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.issues });
      return;
    }
    await SecurityService.disableTotp(rid(req), parseResult.data.password, parseResult.data.token);
    res.json({ message: "2FA disabled successfully" });
  } catch (e: any) {
    if (e.message === "Invalid TOTP token" || e.message === "Invalid password") {
      res.status(401).json({ error: e.message });
      return;
    }
    if (e.message === "2FA is not currently enabled") {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error("2FA disable error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

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
