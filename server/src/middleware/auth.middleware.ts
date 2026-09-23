import type { Request, Response, NextFunction } from "express";
import type { TokenVerifier } from "../ports/TokenVerifier.js";

/**
 * Access-token verification for every protected route.
 *
 * The verifier is injected at boot rather than constructed here, because the
 * signing keys live in the composition root. Route modules import
 * `authenticate` directly, so this module holds the instance for them.
 */
let verifier: TokenVerifier | null = null;

export const initAuthentication = (tokenVerifier: TokenVerifier): void => {
  verifier = tokenVerifier;
};

/**
 * What downstream handlers see.
 *
 * `riderId` keeps the name the existing controllers already use. There is no
 * longer a sessionId: access tokens are verified by signature alone, with no
 * database round trip, and revocation happens when the refresh token is
 * rotated.
 */
export interface JwtPayload {
  riderId: string;
  roles: readonly string[];
}

declare global {
  namespace Express {
    interface Request {
      rider?: JwtPayload;
      auth?: JwtPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // Header checks run first, deliberately. A request with no token is a
  // client error whatever the server's state, and answering 500 to it would
  // both mislead the caller and hide the real failure among routine noise.
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

  if (!verifier) {
    // Reaching here with a token in hand means the route was mounted before
    // the composition root ran — a deployment fault, not a bad request.
    console.error(
      "[auth] authenticate() called before initAuthentication(); rejecting.",
    );
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  try {
    const claims = await verifier.verifyAccessToken(token);
    const payload: JwtPayload = { riderId: claims.sub, roles: claims.roles };
    req.rider = payload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
};
