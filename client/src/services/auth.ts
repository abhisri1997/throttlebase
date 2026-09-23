import { createApiClient } from "../adapters/http/apiClient";
import { createSecureStorage } from "../adapters/storage/secureStorage";
import { createAuthService, nativeProviders } from "./authService";

/**
 * The app's single AuthService, wired to the real adapters.
 *
 * Screens import this. Keeping the wiring in its own module is what lets
 * authService.ts stay free of adapter imports, and therefore testable under
 * plain Node.
 */
export const authService = createAuthService({
  storage: createSecureStorage(),
  createApi: createApiClient,
  providers: nativeProviders,
});

export type { AuthState, OnboardingDetails } from "../ports/AuthService";
export type { Session } from "../core/auth/session";
