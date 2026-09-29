/**
 * Keeps a Socket.IO socket signed in across reconnects.
 *
 * Access tokens last 15 minutes, and a live ride lasts hours. A socket handed
 * one token at connect time presents that same token on every automatic
 * reconnect, so the first drop after it expires (a tunnel, a network change,
 * the phone suspending the app) is refused by the server's handshake check.
 * Socket.IO treats a refused handshake as final and stops reconnecting, which
 * left the rider silently off the live session until a screen reconnected.
 *
 * Two things fix that:
 *
 * - `auth` becomes a function, which Socket.IO calls on every connection
 *   attempt, so each attempt presents whatever token is current then.
 * - After a refused handshake the socket is connected again after a short,
 *   growing delay, by which time a refresh that failed may have got through.
 *
 * Structural types rather than socket.io-client's, so core imports nothing.
 */

/** A valid access token, refreshed if needed, or null when signed out. */
export type AccessTokenSource = () => Promise<string | null>;

/** The parts of a Socket.IO client socket this module uses. */
export interface AuthenticatingSocket {
  auth: unknown;
  /** False once the server has refused the handshake; Socket.IO gives up. */
  readonly active: boolean;
  readonly connected: boolean;
  connect(): unknown;
  on(event: "connect_error", listener: (error: Error) => void): unknown;
}

export interface SocketAuthClock {
  now(): number;
  setTimeout(run: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: SocketAuthClock = {
  now: () => Date.now(),
  setTimeout: (run, delayMs) => setTimeout(run, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const HANDSHAKE_RETRY_BASE_MS = 1_000;
export const HANDSHAKE_RETRY_MAX_MS = 30_000;

/**
 * A refusal this long after the previous one starts the backoff over. Longer
 * than the largest delay, so a run of refusals keeps backing off, while the
 * first refusal after a healthy stretch is retried quickly.
 */
export const HANDSHAKE_RETRY_RESET_MS = 2 * HANDSHAKE_RETRY_MAX_MS;

/** 1 s, 2 s, 4 s … capped at 30 s. */
export const handshakeRetryDelayMs = (attempt: number): number =>
  Math.min(HANDSHAKE_RETRY_MAX_MS, HANDSHAKE_RETRY_BASE_MS * 2 ** attempt);

/**
 * Wires `socket` to ask `getToken` for a token on every connection attempt,
 * and to try again after the server refuses one.
 *
 * Returns a function that cancels any pending retry, for when the socket is
 * thrown away.
 */
export const keepSocketAuthenticated = (
  socket: AuthenticatingSocket,
  getToken: AccessTokenSource,
  clock: SocketAuthClock = systemClock,
): (() => void) => {
  let attempt = 0;
  let lastRefusalAt: number | null = null;
  let pending: unknown = null;
  let stopped = false;

  socket.auth = (send: (data: object) => void): void => {
    getToken().then(
      (token) => send(token ? { token } : {}),
      // No token to offer. The server refuses, and the retry below decides
      // whether to try again.
      () => send({}),
    );
  };

  socket.on("connect_error", () => {
    // A transport failure (no signal, the API restarting) leaves the socket
    // active: Socket.IO is already retrying, and each attempt calls `auth`.
    if (stopped || socket.active || pending !== null) {
      return;
    }

    const now = clock.now();
    if (lastRefusalAt !== null && now - lastRefusalAt > HANDSHAKE_RETRY_RESET_MS) {
      attempt = 0;
    }
    lastRefusalAt = now;

    const delayMs = handshakeRetryDelayMs(attempt);
    attempt += 1;

    pending = clock.setTimeout(() => {
      void getToken()
        .catch(() => null)
        .then((token) => {
          pending = null;
          // Signed out: nothing to connect with. Signing in again connects
          // afresh.
          if (!token || stopped || socket.connected) {
            return;
          }
          socket.connect();
        });
    }, delayMs);
  });

  return () => {
    stopped = true;
    if (pending !== null) {
      clock.clearTimeout(pending);
      pending = null;
    }
  };
};
