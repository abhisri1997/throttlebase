/**
 * What the app knows about a signed-in rider.
 *
 * Timestamps are epoch milliseconds rather than Date objects: this value is
 * serialised to storage and read back inside background tasks, and a plain
 * number survives that round trip without a revival step.
 */
export interface Session {
  riderId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  needsOnboarding: boolean;
}

/**
 * Refresh this long before the access token actually expires.
 *
 * A token that passes the check and then expires mid-flight costs a failed
 * request and a retry. Sixty seconds covers clock skew between device and
 * server plus a slow mobile round trip.
 */
export const REFRESH_SKEW_MS = 60_000;

export const isAccessTokenUsable = (session: Session, nowMs: number): boolean =>
  nowMs + REFRESH_SKEW_MS < session.accessTokenExpiresAt;

export const isRefreshTokenExpired = (session: Session, nowMs: number): boolean =>
  nowMs >= session.refreshTokenExpiresAt;

/** What getValidSession should do with the session it loaded. */
export type SessionAction = "use" | "refresh" | "sign-out";

export const decideSessionAction = (
  session: Session | null,
  nowMs: number,
): SessionAction => {
  if (!session) {
    return "sign-out";
  }

  // A dead refresh token cannot be recovered from, so there is no point
  // attempting a refresh that will certainly 401.
  if (isRefreshTokenExpired(session, nowMs)) {
    return "sign-out";
  }

  return isAccessTokenUsable(session, nowMs) ? "use" : "refresh";
};

export interface SessionResponse {
  riderId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  needsOnboarding?: boolean;
}

/** Converts the API's ISO timestamps into the stored shape. */
export const sessionFromResponse = (
  response: SessionResponse,
  previous?: Session | null,
): Session => ({
  riderId: response.riderId,
  accessToken: response.accessToken,
  accessTokenExpiresAt: Date.parse(response.accessTokenExpiresAt),
  refreshToken: response.refreshToken,
  refreshTokenExpiresAt: Date.parse(response.refreshTokenExpiresAt),
  // A refresh response says nothing about onboarding, so carry the known
  // value forward rather than silently resetting it to false.
  needsOnboarding: response.needsOnboarding ?? previous?.needsOnboarding ?? false,
});
