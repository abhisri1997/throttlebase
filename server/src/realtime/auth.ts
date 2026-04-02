import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../middleware/auth.middleware.js";
import { query } from "../config/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_dev_secret";

type LiveSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  { rider?: JwtPayload }
>;

const getTokenFromSocket = (socket: LiveSocket): string | null => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  const authHeader = socket.handshake.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
};

export const authenticateLiveSocket = (
  socket: LiveSocket,
  next: (err?: Error) => void,
): void => {
  void (async () => {
  const token = getTokenFromSocket(socket);

  if (!token) {
    next(new Error("Access denied. No token provided."));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded.sessionId) {
      next(new Error("Invalid or expired token."));
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
      next(new Error("Invalid or expired token."));
      return;
    }

    socket.data.rider = decoded;
    next();
  } catch {
    next(new Error("Invalid or expired token."));
  }
  })();
};
