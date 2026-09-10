const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

/** Decimal places kept when falling back to raw coordinates (~1m precision). */
const COORD_PRECISION = 5;

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

/**
 * Google answers with HTTP 200 even when it refuses the request, so the
 * payload status is the only thing that separates "nothing is here" from
 * "this key is not allowed to call the Geocoding API".
 */
const NON_ERROR_STATUSES = ['OK', 'ZERO_RESULTS'];

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
 * Reverse-geocodes coordinates through the Google Geocoding API so that
 * "Use My Current Location" and a dragged pin resolve to the same kind of
 * address (same provider, same formatting/precision) as the Places
 * Autocomplete search results above. The on-device geocoder used previously
 * returned noticeably coarser/inconsistent addresses (often missing the
 * locality or street) compared to what Google Maps shows for the exact same
 * coordinates.
 *
 * Never rejects: every failure degrades to formatted coordinates so the
 * caller always has something to display, and logs the reason so a
 * misconfigured key is diagnosable instead of silently looking like a
 * location with no known address.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string = DEFAULT_API_KEY,
): Promise<string> {
  const fallback = formatCoords(lat, lng);

  if (!isValidCoordinate(lat, lng)) {
    console.error('Reverse geocode skipped: invalid coordinates', { lat, lng });
    return fallback;
  }

  if (!apiKey) {
    console.error(
      'Reverse geocode skipped: EXPO_PUBLIC_GOOGLE_PLACES_API_KEY is not set.',
    );
    return fallback;
  }

  try {
    const response = await fetch(
      `${GOOGLE_GEOCODE_URL}?latlng=${lat},${lng}&key=${apiKey}`,
    );

    if (!response.ok) {
      console.error(
        `Reverse geocode failed: HTTP ${response.status} ${response.statusText}`,
      );
      return fallback;
    }

    const data = await response.json();

    if (!NON_ERROR_STATUSES.includes(data?.status)) {
      console.error(
        `Reverse geocode failed: ${data?.status ?? 'UNKNOWN_STATUS'}`,
        data?.error_message ?? '',
      );
      return fallback;
    }

    return data?.results?.[0]?.formatted_address || fallback;
  } catch (err) {
    console.error('Reverse geocode request error:', err);
    return fallback;
  }
}
