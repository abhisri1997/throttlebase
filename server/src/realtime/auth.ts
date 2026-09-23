import type { Socket } from "socket.io";
import type { JwtPayload } from "../middleware/auth.middleware.js";
import type { TokenVerifier } from "../ports/TokenVerifier.js";

type LiveSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  { rider?: JwtPayload }
>;

/**
 * Socket handshake authentication.
 *
 * Same contract as the HTTP middleware: verify the signature, the issuer, the
 * audience and the expiry, and nothing else. A long-lived socket outlives its
 * access token, which is fine — authorisation for each action is checked
 * against the rider id when the action happens, and a client that reconnects
 * presents a freshly refreshed token.
 */
let verifier: TokenVerifier | null = null;

export const initSocketAuthentication = (tokenVerifier: TokenVerifier): void => {
  verifier = tokenVerifier;
};

const getTokenFromSocket = (socket: LiveSocket): string | null => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  const authHeader = socket.handshake.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim() || null;
};

export const authenticateLiveSocket = (
  socket: LiveSocket,
  next: (err?: Error) => void,
): void => {
  void (async () => {
    if (!verifier) {
      next(new Error("Authentication is not initialised"));
      return;
    }

    const token = getTokenFromSocket(socket);
    if (!token) {
      next(new Error("Access denied. No token provided."));
      return;
    }

    try {
      const claims = await verifier.verifyAccessToken(token);
      socket.data.rider = { riderId: claims.sub, roles: claims.roles };
      next();
    } catch {
      next(new Error("Invalid or expired token."));
    }
  })();
};
