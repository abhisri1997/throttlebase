import type { NextFunction, Request, Response } from "express";
import type { TokenVerifier } from "../../ports/TokenVerifier.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { riderId: string; roles: readonly string[] };
    }
  }
}

/**
 * Verifies the access token on a request.
 *
 * Stateless by design: signature, issuer, audience and expiry only, with no
 * database round trip. A 15-minute token is short enough that revocation at
 * refresh time is sufficient, and this middleware sits in front of every
 * authenticated route, so a query here would be a query on every request.
 */
export const createAuthenticate = (verifier: TokenVerifier) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Access denied. No token provided." });
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "Access denied. No token provided." });
      return;
    }

    try {
      const claims = await verifier.verifyAccessToken(token);
      req.auth = { riderId: claims.sub, roles: claims.roles };
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token." });
    }
  };

/** Route guard for role-gated endpoints. */
export const requireRole = (role: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth?.roles.includes(role)) {
      res.status(403).json({ error: "Insufficient permissions." });
      return;
    }
    next();
  };
