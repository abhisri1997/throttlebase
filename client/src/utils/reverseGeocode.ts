import { fetchReverseGeocode, isMapsQuotaError } from '../api/maps';

/** Decimal places kept when falling back to raw coordinates (~1m precision). */
const COORD_PRECISION = 5;

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= MIN_LAT &&
    lat <= MAX_LAT &&
    lng >= MIN_LNG &&
    lng <= MAX_LNG
  );
}

/** Human-readable coordinates, used whenever no address can be resolved. */
export function formatCoords(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Unknown location';
  return `${lat.toFixed(COORD_PRECISION)}, ${lng.toFixed(COORD_PRECISION)}`;
}

/**
 * Reverse-geocodes coordinates through the backend maps proxy so that
 * "Use My Current Location" and a dragged pin resolve to the same kind of
 * address (same provider, same formatting/precision) as the place search
 * results above. The on-device geocoder used previously returned noticeably
 * coarser/inconsistent addresses (often missing the locality or street)
 * compared to what Google Maps shows for the exact same coordinates.
 *
 * Never rejects: every failure degrades to formatted coordinates so the
 * caller always has something to display, and logs the reason so a
 * misconfigured deployment is diagnosable instead of silently looking like a
 * location with no known address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = formatCoords(lat, lng);

  if (!isValidCoordinate(lat, lng)) {
    console.error('Reverse geocode skipped: invalid coordinates', { lat, lng });
    return fallback;
  }

  try {
    // The server answers with a null address for a point Google cannot name,
    // which is a real answer rather than a failure — coordinates are correct.
    return (await fetchReverseGeocode(lat, lng)) || fallback;
  } catch (err) {
    if (isMapsQuotaError(err)) {
      console.warn('Reverse geocode skipped: maps quota reached.');
    } else {
      console.error('Reverse geocode request error:', err);
    }
    return fallback;
  }
}
