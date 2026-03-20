import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
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
    req.rider = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
