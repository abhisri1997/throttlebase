/**
 * What is at a route's ends, for deciding what riders other than its owner
 * see (core/routes/communityRoute.ts): a clearly public place, or an area
 * name. The API and the purge pass GOOGLE_LOOKUPS; services default to
 * NO_LOOKUPS, so nothing but those callers ever calls Google.
 */
import { HOME_LIKE_PLACE_TYPES, PUBLIC_PLACE_RADIUS_METERS, PUBLIC_PLACE_TYPES, type PublicPlace } from "../core/routes/communityRoute.js";
import { reverseGeocodeArea } from "./maps.service.js";
import { resolveMapsProvider } from "./maps/resolveProvider.js";

type Point = { lat: number; lng: number };

export interface RoutePlaceLookups {
  /** A clearly public place at a point, or null. */
  findPublicPlace: (point: Point) => Promise<PublicPlace | null>;
  /** The area a point is in ("HSR Layout, Bengaluru"), or null. */
  nameArea: (point: Point) => Promise<string | null>;
}

/** The area a point is in, through the cached, budgeted Google lookup. */
export const nameAreaWithGoogle = async (point: Point): Promise<string | null> => {
  const provider = resolveMapsProvider();
  if (!provider) return null;
  return (await reverseGeocodeArea(point, { provider })).areaName;
};

const findPublicPlaceWithGoogle = async (point: Point): Promise<PublicPlace | null> => {
  const provider = resolveMapsProvider();
  if (!provider) return null;
  const [place] = await provider.searchNearby({
    lat: point.lat,
    lng: point.lng,
    radiusMeters: PUBLIC_PLACE_RADIUS_METERS,
    includedTypes: [...PUBLIC_PLACE_TYPES],
    excludedTypes: [...HOME_LIKE_PLACE_TYPES],
    rankByDistance: true,
    maxResultCount: 1,
  });
  return place ? { name: place.name, lat: place.lat, lng: place.lng } : null;
};

export const GOOGLE_LOOKUPS: RoutePlaceLookups = {
  findPublicPlace: findPublicPlaceWithGoogle,
  nameArea: nameAreaWithGoogle,
};

/** For tests and for running without Google: every end is trimmed and nothing is named. */
export const NO_LOOKUPS: RoutePlaceLookups = {
  findPublicPlace: async () => null,
  nameArea: async () => null,
};

/** A lookup that fails, for an outage or a spent quota, finds nothing: that end is trimmed. */
export const orNull = async <T>(lookup: () => Promise<T | null>): Promise<T | null> => {
  try {
    return await lookup();
  } catch (error) {
    console.warn("[routes] a place lookup failed; treating it as none:", error instanceof Error ? error.message : error);
    return null;
  }
};
