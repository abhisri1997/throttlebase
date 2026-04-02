import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret';

/**
 * JWT Payload shape — what we encode inside the token.
 *
 * Learning Note:
 * We extend the Express Request type to include `rider` so that
 * downstream route handlers can access the authenticated user's info.
 */
export interface JwtPayload {
  riderId: string;
  email: string;
  sessionId?: string;
}

// Extend Express Request to include rider info from the JWT
declare global {
  namespace Express {
    interface Request {
      rider?: JwtPayload;
    }
  }
}

/**
 * authenticate middleware
 *
 * 1. Extract the Bearer token from the Authorization header
 * 2. Verify and decode it using jsonwebtoken
 * 3. Attach the decoded payload to req.rider
 * 4. Return 401 if token is missing or invalid
 *
 * Learning Note:
 * This is the "gatekeeper" pattern. Any route that uses this middleware
 * can trust that req.rider is always populated with a valid user.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded.sessionId) {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }

    const sessionResult = await query(
      `SELECT id
       FROM sessions
       WHERE id = $1
         AND rider_id = $2
         AND revoked_at IS NULL
         AND expires_at > now()`,
      [decoded.sessionId, decoded.riderId],
    );

    if (sessionResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }

    req.rider = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
