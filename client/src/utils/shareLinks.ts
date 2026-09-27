/** The public site, used when EXPO_PUBLIC_SHARE_BASE_URL is not set. */
const DEFAULT_WEB_BASE = "https://throttlebase.in";

export interface ShareLinks {
  appLink: string;
  webLink: string;
  /** The link to put in front of people: the web one, which opens the app where it is installed. */
  primaryLink: string;
}

/** Links to a screen of the app, e.g. "/route/abc", for sharing outside it. */
export const buildShareLinks = (
  path: string,
  appLinkFor: (path: string) => string,
  configuredWebBase: string | undefined,
): ShareLinks => {
  const webBase = (configuredWebBase?.trim() || DEFAULT_WEB_BASE).replace(/\/+$/, "");
  const webLink = `${webBase}${path}`;
  return { appLink: appLinkFor(path), webLink, primaryLink: webLink };
};
