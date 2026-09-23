import type { Session } from "../core/auth/session.js";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; session: Session };

export interface OnboardingDetails {
  username: string;
  displayName: string;
  experienceLevel: string;
  locationCity: string | null;
  firstVehicle: {
    make: string;
    model: string;
    year: number | null;
    engineCapacityCc: number | null;
  } | null;
}

/**
 * The app's whole authentication surface.
 *
 * Screens import this and nothing below it. Which provider SDK signs the
 * rider in, where the tokens are kept and how they are refreshed are all
 * implementation details on the far side of this interface.
 */
export interface AuthService {
  signInWithGoogle(): Promise<Session>;
  signInWithApple(): Promise<Session>;
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<Session>;

  /**
   * The current session, refreshed if it is about to expire.
   *
   * Safe to call from a background task: it reads storage rather than React
   * state, and concurrent callers share one refresh.
   */
  getValidSession(): Promise<Session | null>;

  /** Availability check behind the onboarding form. */
  checkUsername(candidate: string): Promise<{ available: boolean; reason: string }>;
  completeOnboarding(details: OnboardingDetails): Promise<void>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
  signOutEverywhere(): Promise<void>;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
}
