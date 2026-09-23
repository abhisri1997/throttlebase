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
