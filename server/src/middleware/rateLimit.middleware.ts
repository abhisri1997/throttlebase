import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
  if (rider?.riderId) {
    return rider.riderId;
  }

  // The IP fallback goes through ipKeyGenerator, which normalises IPv6 to its
  // /56 prefix. Keying on a raw IPv6 address would let one client vary the
  // low bits and get an unlimited number of fresh buckets.
  return ipKeyGenerator(req.ip ?? "unknown");
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

const MINUTE_MS = 60 * 1000;

/**
 * Per-rider ceiling for the /api/maps proxy.
 *
 * Sized above what a real session produces — a debounced search is a handful of
 * calls, and live navigation reroutes are already gated by their own cooldown —
 * so this only catches a client stuck in a loop. The daily per-API budget in
 * maps.service is the actual spend ceiling.
 */
export const mapsProxyLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 30,
  keyGenerator: riderKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Maps quota reached. Try again shortly.",
    code: "maps_quota",
  },
});
