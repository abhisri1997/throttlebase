import { ACCOUNT_DELETION } from "./accountDeletion";
import type { LegalDocument } from "./legalDocument";
import { GRIEVANCE } from "./grievance";
import { PRIVACY_POLICY } from "./privacyPolicy";
import { TERMS } from "./terms";

/**
 * The legal pages by path. Anyone can open them, signed in or not: the
 * sign-in screen, the stores and throttlebase.in all link here.
 */
export const LEGAL_PAGES: ReadonlyMap<string, LegalDocument> = new Map([
  ["/privacy", PRIVACY_POLICY],
  ["/terms", TERMS],
  ["/grievance", GRIEVANCE],
  // Also the in-app deletion screen: open signed out, as Google Play requires.
  ["/delete-account", ACCOUNT_DELETION],
]);

/** Whether a pathname (as from usePathname) is a legal page, trailing slash or not. */
export const isLegalPath = (pathname: string): boolean =>
  LEGAL_PAGES.has(pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);
