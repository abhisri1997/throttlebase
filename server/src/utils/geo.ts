/**
 * Geographic utility functions for ride location calculations.
 */

interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Calculates the geographic centroid of multiple lat/lng points.
 * Uses 3D Cartesian conversion for accuracy across large distances.
 *
 * This gives a raw centroid — use snapToNearestPlace() to find
 * an accessible location near it.
 */
export function calculateCentroid(locations: LatLng[]): LatLng {
  if (locations.length === 0) {
    throw new Error('At least one location is required');
  }

  if (locations.length === 1) {
    return locations[0]!;
  }

  let x = 0, y = 0, z = 0;

  for (const loc of locations) {
    const latRad = toRad(loc.lat);
    const lngRad = toRad(loc.lng);
    x += Math.cos(latRad) * Math.cos(lngRad);
    y += Math.cos(latRad) * Math.sin(lngRad);
    z += Math.sin(latRad);
  }

  const n = locations.length;
  x /= n;
  y /= n;
  z /= n;

  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return { lat: toDeg(lat), lng: toDeg(lng) };
}

/**
 * Uses Google Places Nearby Search to find the nearest accessible location
 * to a raw centroid point. Prioritizes meetup-friendly places like gas stations,
 * cafes, parking lots, and restaurants.
 *
 * Returns the snapped location with a place name, or falls back to the
 * raw centroid with a reverse-geocoded address.
 */
export async function snapToNearestPlace(
  centroid: LatLng,
  apiKey: string
): Promise<{ lat: number; lng: number; name: string; address: string }> {
  const { lat, lng } = centroid;

  // Try to find an accessible meetup location near the centroid
  // Search within 2km radius for meetup-friendly places
  const placeTypes = ['gas_station', 'cafe', 'restaurant', 'parking'];

  for (const type of placeTypes) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=2000&type=${type}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const place = data.results[0];
        return {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          name: place.name,
          address: place.vicinity || place.formatted_address || '',
        };
      }
    } catch (error) {
      console.error(`Nearby search failed for type ${type}:`, error);
    }
  }

  // Fallback: reverse geocode the raw centroid to at least get a readable address
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      return {
        lat,
        lng,
        name: 'Calculated Meeting Point',
        address: data.results[0].formatted_address,
      };
    }
  } catch (error) {
    console.error('Reverse geocode failed:', error);
  }

  // Ultimate fallback
  return {
    lat,
    lng,
    name: 'Calculated Meeting Point',
    address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
  };
}
