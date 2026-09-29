import type { LegalDocument } from "./legalDocument";
import { PRIVACY_POLICY } from "./privacyPolicy";
import { TERMS } from "./terms";

/**
 * The legal pages by path. Anyone can open them, signed in or not: the
 * sign-in screen, the stores and throttlebase.in all link here.
 */
export const LEGAL_PAGES: ReadonlyMap<string, LegalDocument> = new Map([
  ["/privacy", PRIVACY_POLICY],
  ["/terms", TERMS],
]);

/** Whether a pathname (as from usePathname) is a legal page, trailing slash or not. */
export const isLegalPath = (pathname: string): boolean =>
  LEGAL_PAGES.has(pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);
