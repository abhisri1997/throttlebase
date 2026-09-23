/**
 * Re-exported so core modules import rate-limit shapes from one place
 * without reaching across into ports for the policy half.
 */
export type { RateLimiter, RateLimitDecision, RateLimitRequest } from "../../ports/RateLimiter.js";
export type { RateLimitRule } from "./types.js";
