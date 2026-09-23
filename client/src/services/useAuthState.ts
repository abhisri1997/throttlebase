import { useEffect, useState } from "react";
import type { AuthState } from "../ports/AuthService";
import { authService } from "./auth";

/**
 * Subscribes a component to the auth state.
 *
 * The service is the single source of truth — including for background tasks,
 * which have no React tree — so this is a view onto it rather than a store of
 * its own.
 */
export const useAuthState = (): AuthState => {
  const [state, setState] = useState<AuthState>(() => authService.getState());

  useEffect(() => authService.onChange(setState), []);

  return state;
};

/**
 * Resolves the session once at startup, refreshing it if needed.
 *
 * Returns true when the answer is known, so the app can hold the splash
 * rather than flashing the sign-in screen at a rider who is already signed in.
 */
export const useResolvedSession = (): boolean => {
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authService.getValidSession().finally(() => {
      if (!cancelled) setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return resolved;
};

/**
 * A currently-valid access token, refreshed if needed.
 *
 * Sockets and anything else that needs a raw token should use this rather
 * than holding one: access tokens last 15 minutes, so a value captured at
 * sign-in is stale long before the screen closes. Re-resolves whenever the
 * auth state changes, which covers refresh and sign-out.
 */
export const useAccessToken = (): string | null => {
  const state = useAuthState();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (state.status !== "signed-in") {
      setToken(null);
      return;
    }

    void authService.getValidSession().then((session) => {
      if (!cancelled) {
        setToken(session?.accessToken ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state.status, state.status === "signed-in" ? state.session.accessToken : null]);

  return token;
};
