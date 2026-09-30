import type { Session } from "../core/auth/session";

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
   * Null only when the rider is signed out. If the refresh gets no answer
   * (no signal, a timeout, a 5xx) the session comes back as it is, access
   * token possibly stale, and the next call tries the refresh again.
   *
   * Safe to call from a background task: it reads storage rather than React
   * state, and concurrent callers share one refresh.
   */
  getValidSession(): Promise<Session | null>;

  /** Availability check behind the onboarding form. */
  checkUsername(candidate: string): Promise<{ available: boolean; reason: string }>;
  completeOnboarding(details: OnboardingDetails): Promise<void>;
  /** Emails the rider the code that confirms deleting their account. */
  requestDeletionCode(): Promise<void>;
  /** Deletes the account with that code, then signs out on this device. */
  deleteAccount(code: string): Promise<void>;
  /**
   * Signed out, as on throttlebase.in/delete-account: emails a deletion code
   * to the address if it has an account. The answer never says whether it does.
   */
  requestDeletionCodeFor(email: string): Promise<void>;
  /** Deletes the account at the address with that code; false if there was none. */
  deleteAccountByEmail(email: string, code: string): Promise<{ deleted: boolean }>;
  signOut(): Promise<void>;
  signOutEverywhere(): Promise<void>;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
}
