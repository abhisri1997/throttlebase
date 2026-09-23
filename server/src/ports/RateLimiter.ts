export interface RateLimitRequest {
  /** Logical bucket, e.g. "email_otp_start". */
  bucket: string;
  /** What is being limited: an email address, or an IP. */
  subject: string;
  limit: number;
  windowSeconds: number;
  now: Date;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}
