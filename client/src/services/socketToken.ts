import { authService } from "./auth";

/**
 * The access token a socket presents when it connects: the current one,
 * refreshed first if it is about to expire. Null when signed out.
 */
export const currentAccessToken = async (): Promise<string | null> =>
  (await authService.getValidSession())?.accessToken ?? null;
