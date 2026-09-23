/** Addresses Apple mints when a rider hides their real address. */
const APPLE_PRIVATE_RELAY_DOMAIN = "@privaterelay.appleid.com";

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const isApplePrivateRelay = (email: string): boolean =>
  normalizeEmail(email).endsWith(APPLE_PRIVATE_RELAY_DOMAIN);

/**
 * A relay address is stable per app, but it is not the rider's real address
 * and two people can never be assumed to share one. Linking on it would let
 * an Apple sign-in silently take over an account, so it is never a link key.
 */
export const isLinkableEmail = (
  email: string | null,
  emailVerified: boolean,
): email is string =>
  email !== null && emailVerified && !isApplePrivateRelay(email);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isPlausibleEmail = (raw: string): boolean =>
  EMAIL_PATTERN.test(normalizeEmail(raw));
