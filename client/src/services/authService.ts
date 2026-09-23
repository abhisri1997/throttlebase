import {
  decideSessionAction,
  sessionFromResponse,
  type Session,
  type SessionResponse,
} from "../core/auth/session";
import { createSingleFlight } from "../core/auth/singleFlight";
import type { ApiClient } from "../ports/ApiClient";
import type {
  AuthService,
  AuthState,
  OnboardingDetails,
} from "../ports/AuthService";
import type { SecureStorage } from "../ports/SecureStorage";
import type { AppleCredentialPayload } from "../adapters/auth/appleSignIn";

/**
 * The provider SDKs are reached through these, and imported lazily.
 *
 * A static import would pull the native Google and Apple modules into every
 * consumer of this file, including the test runner, which has no native
 * bridge. Loading them at the moment a rider taps a sign-in button keeps the
 * service constructible anywhere.
 */
export interface ProviderSignIn {
  google(): Promise<string>;
  apple(): Promise<AppleCredentialPayload>;
  googleSignOut(): Promise<void>;
}

export const nativeProviders: ProviderSignIn = {
  google: async () => {
    const { signInWithGoogleNatively } = await import("../adapters/auth/googleSignIn");
    return await signInWithGoogleNatively();
  },
  apple: async () => {
    const { signInWithAppleNatively } = await import("../adapters/auth/appleSignIn");
    return await signInWithAppleNatively();
  },
  googleSignOut: async () => {
    const { signOutOfGoogle } = await import("../adapters/auth/googleSignIn");
    await signOutOfGoogle();
  },
};

const SESSION_KEY = "throttlebase.session.v1";

/**
 * The terms version the app displays. Sent on account creation and checked by
 * the backend, so a stale build cannot silently enrol someone under terms it
 * never showed them.
 */
const ACCEPTED_TERMS_VERSION =
  process.env.EXPO_PUBLIC_TERMS_VERSION?.trim() || "2026-01-01";

export interface AuthServiceDeps {
  storage: SecureStorage;
  /**
   * Supplied rather than constructed here so this module imports no adapter.
   * A static import of the HTTP or storage adapter would drag react-native
   * into every consumer, including the test runner, which has no bridge.
   */
  createApi?: (options: {
    getAccessToken: () => Promise<string | null>;
    refreshAccessToken: () => Promise<string | null>;
  }) => ApiClient;
  providers: ProviderSignIn;
  /** Overridden in tests; the app uses the wall clock. */
  now?: () => number;
  /** Pre-built client, for tests that want to observe every request. */
  apiClient?: ApiClient;
}

export const createAuthService = (deps: AuthServiceDeps): AuthService => {
  const storage = deps.storage;
  const providers = deps.providers;
  const now = deps.now ?? (() => Date.now());

  let state: AuthState = { status: "loading" };
  const listeners = new Set<(next: AuthState) => void>();

  // Cached so background tasks do not hit the keychain on every GPS sample.
  let cached: Session | null | undefined;

  const setState = (next: AuthState): void => {
    state = next;
    for (const listener of listeners) {
      listener(next);
    }
  };

  const persist = async (session: Session | null): Promise<void> => {
    cached = session;

    if (session) {
      await storage.set(SESSION_KEY, JSON.stringify(session));
      setState({ status: "signed-in", session });
    } else {
      await storage.remove(SESSION_KEY);
      setState({ status: "signed-out" });
    }
  };

  const load = async (): Promise<Session | null> => {
    if (cached !== undefined) {
      return cached;
    }

    const raw = await storage.get(SESSION_KEY);
    if (!raw) {
      cached = null;
      return null;
    }

    try {
      cached = JSON.parse(raw) as Session;
    } catch {
      // Unreadable storage is treated as signed out rather than crashing the
      // app on launch.
      cached = null;
      await storage.remove(SESSION_KEY);
    }

    return cached;
  };

  /**
   * Exactly one refresh may be in flight.
   *
   * The backend rotates on every use and revokes the whole family when an
   * already-rotated token is presented, so two concurrent refreshes would log
   * the rider out. Screens and background location tasks both come through
   * here, and they wake at the same time more often than you would expect.
   */
  const refreshOnce = createSingleFlight<Session | null>();

  if (!deps.apiClient && !deps.createApi) {
    throw new Error("createAuthService needs either apiClient or createApi");
  }

  /**
   * Declared before `api` on purpose.
   *
   * `refresh` calls `api`, and `api` is built with a callback that calls
   * `refresh` — a genuine cycle. A function declaration is hoisted and
   * explicitly typed, which lets each side see the other without TypeScript
   * having to infer one from the other. Written as two `const` arrows it
   * type-checks, but only by recursing deeply enough to exhaust the stack on
   * a project this size.
   */
  async function refresh(): Promise<Session | null> {
    return await refreshOnce(async (): Promise<Session | null> => {
      const current = await load();
      if (!current) {
        return null;
      }

      try {
        const response = await api.request<SessionResponse>({
          path: "/auth/refresh",
          method: "POST",
          anonymous: true,
          body: { refreshToken: current.refreshToken },
        });

        const next = sessionFromResponse(response, current);
        await persist(next);
        return next;
      } catch {
        // A refusal here means the token was rotated away, revoked or
        // expired. None of those are recoverable, so the rider signs in again.
        await persist(null);
        return null;
      }
    });
  }

  const api: ApiClient =
    deps.apiClient ??
    (deps.createApi as NonNullable<AuthServiceDeps["createApi"]>)({
      getAccessToken: async (): Promise<string | null> => {
        const session = await load();
        return session?.accessToken ?? null;
      },
      refreshAccessToken: async (): Promise<string | null> => {
        const session = await refresh();
        return session?.accessToken ?? null;
      },
    });

  const adopt = async (response: SessionResponse): Promise<Session> => {
    const session = sessionFromResponse(response);
    await persist(session);
    return session;
  };

  return {
    signInWithGoogle: async (): Promise<Session> => {
      const idToken = await providers.google();
      const response = await api.request<SessionResponse>({
        path: "/auth/google",
        method: "POST",
        anonymous: true,
        body: { idToken, acceptedTermsVersion: ACCEPTED_TERMS_VERSION },
      });
      return await adopt(response);
    },

    signInWithApple: async (): Promise<Session> => {
      const credential = await providers.apple();
      const response = await api.request<SessionResponse>({
        path: "/auth/apple",
        method: "POST",
        anonymous: true,
        body: { ...credential, acceptedTermsVersion: ACCEPTED_TERMS_VERSION },
      });
      return await adopt(response);
    },

    sendEmailCode: async (email: string): Promise<void> => {
      await api.request<{ accepted: boolean }>({
        path: "/auth/email/start",
        method: "POST",
        anonymous: true,
        body: { email },
      });
    },

    verifyEmailCode: async (email: string, code: string): Promise<Session> => {
      const response = await api.request<SessionResponse>({
        path: "/auth/email/verify",
        method: "POST",
        anonymous: true,
        body: { email, code, acceptedTermsVersion: ACCEPTED_TERMS_VERSION },
      });
      return await adopt(response);
    },

    getValidSession: async (): Promise<Session | null> => {
      const session = await load();

      switch (decideSessionAction(session, now())) {
        case "use":
          return session;
        case "refresh":
          return await refresh();
        case "sign-out":
          if (session) {
            await persist(null);
          } else if (state.status === "loading") {
            setState({ status: "signed-out" });
          }
          return null;
      }
    },

    checkUsername: async (
      candidate: string,
    ): Promise<{ available: boolean; reason: string }> =>
      await api.request({
        path: `/api/riders/username-available?u=${encodeURIComponent(candidate)}`,
      }),

    completeOnboarding: async (details: OnboardingDetails): Promise<void> => {
      await api.request({
        path: "/api/riders/me/onboarding",
        method: "PATCH",
        body: details,
      });

      const current = await load();
      if (current) {
        await persist({ ...current, needsOnboarding: false });
      }
    },

    deleteAccount: async (): Promise<void> => {
      await api.request({ path: "/api/riders/me", method: "DELETE" });
      await providers.googleSignOut();
      await persist(null);
    },

    signOut: async (): Promise<void> => {
      const current = await load();

      if (current) {
        try {
          await api.request({
            path: "/auth/logout",
            method: "POST",
            anonymous: true,
            body: { refreshToken: current.refreshToken },
          });
        } catch {
          // Local sign-out must succeed even offline; the session expires
          // server-side regardless.
        }
      }

      await providers.googleSignOut();
      await persist(null);
    },

    signOutEverywhere: async (): Promise<void> => {
      try {
        await api.request({ path: "/auth/logout-all", method: "POST" });
      } catch {
        // Same reasoning as signOut.
      }
      await providers.googleSignOut();
      await persist(null);
    },

    onChange: (listener: (next: AuthState) => void): (() => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    getState: (): AuthState => state,
  };
};

