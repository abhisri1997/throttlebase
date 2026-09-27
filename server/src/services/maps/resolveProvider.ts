import type { MapsProvider } from "./mapsProvider.js";
import { createGoogleMapsProvider } from "./googleMapsProvider.js";

let cachedProvider: MapsProvider | null = null;

/**
 * Builds the provider once per process. Returns null when the key is missing,
 * which is a deployment fault rather than a client one: it is logged loudly and
 * callers treat it as the maps service being unavailable.
 */
export const resolveMapsProvider = (): MapsProvider | null => {
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[maps] GOOGLE_MAPS_API_KEY is not configured; maps features are disabled.");
    return null;
  }

  cachedProvider = createGoogleMapsProvider({ apiKey });
  return cachedProvider;
};
