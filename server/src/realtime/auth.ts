import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../middleware/auth.middleware.js";

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
  const token = getTokenFromSocket(socket);

  if (!token) {
    next(new Error("Access denied. No token provided."));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    socket.data.rider = decoded;
    next();
  } catch {
    next(new Error("Invalid or expired token."));
  }
};
