/**
 * Errors core raises. The HTTP adapter maps these to status codes; core never
 * knows about status codes itself.
 */
export type AuthErrorCode =
  | "INVALID_CREDENTIAL"
  | "IDENTITY_UNVERIFIED"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_ATTEMPTS_EXCEEDED"
  | "RATE_LIMITED"
  | "REFRESH_TOKEN_INVALID"
  | "REFRESH_TOKEN_REUSED"
  | "CONSENT_REQUIRED"
  | "USERNAME_INVALID"
  | "USERNAME_TAKEN"
  | "RIDER_NOT_FOUND";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: AuthErrorCode,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const isAuthError = (error: unknown): error is AuthError =>
  error instanceof AuthError;

/**
 * Internal signal, never surfaced over HTTP: another transaction created the
 * same (provider, subject) first. The caller rolls back and retries, which
 * turns a first sign-in race into an ordinary login.
 */
export class ConcurrentIdentityError extends Error {
  constructor() {
    super("Identity was created concurrently");
    this.name = "ConcurrentIdentityError";
  }
}
