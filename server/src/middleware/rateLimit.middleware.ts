import rateLimit from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limits for endpoints that spend money on outbound Google calls.
 *
 * Keyed on rider id rather than IP: the cost follows the account, and several
 * riders behind one mobile carrier NAT share an IP. Falls back to IP only for
 * unauthenticated requests, which these routes reject anyway.
 *
 * The default store is in-memory, so counters reset on restart and do not span
 * instances. The daily budget counter in placeSuggestion.service is the real
 * ceiling; this limiter exists to stop a single client looping.
 */
const riderKey = (req: Request): string => {
  const rider = (req as Request & { rider?: { riderId?: string } }).rider;
  return rider?.riderId ?? req.ip ?? "unknown";
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const TOO_MANY_REQUESTS = {
  error: "Too many suggestion requests. Try again later.",
};

export const stopSuggestionHourlyLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: 20,
  keyGenerator: riderKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

export const stopSuggestionDailyLimiter = rateLimit({
  windowMs: DAY_MS,
  limit: 60,
  keyGenerator: riderKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});
