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
    throw new Error("At least one location is required");
  }

  if (locations.length === 1) {
    return locations[0]!;
  }

  let x = 0,
    y = 0,
    z = 0;

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
 * Calculates the Geometric Median of multiple lat/lng points using Weiszfeld's
 * iterative algorithm. This finds a point that minimizes the sum of Euclidean
 * distances to all given points (the Weber Problem), providing a fairer and
 * truly "equidistant" central meeting point compared to simple squared-distance centroids.
 *
 * If a destination is provided, it is included in the computation with a specified
 * weight (defaulting to 2) to pull the meeting point steadily closer to the destination.
 */
export function calculateGeometricMedian(
  locations: LatLng[],
  destination?: LatLng,
  destWeight: number = 2,
): LatLng {
  if (locations.length === 0) {
    if (destination) return destination;
    throw new Error("At least one location is required");
  }

  // Define points and their weights
  const points: { x: number; y: number; z: number; w: number }[] = [];

  for (const loc of locations) {
    const latRad = toRad(loc.lat);
    const lngRad = toRad(loc.lng);
    points.push({
      x: Math.cos(latRad) * Math.cos(lngRad),
      y: Math.cos(latRad) * Math.sin(lngRad),
      z: Math.sin(latRad),
      w: 1, // standard weight for a rider
    });
  }

  if (destination) {
    const destLatRad = toRad(destination.lat);
    const destLngRad = toRad(destination.lng);
    points.push({
      x: Math.cos(destLatRad) * Math.cos(destLngRad),
      y: Math.cos(destLatRad) * Math.sin(destLngRad),
      z: Math.sin(destLatRad),
      w: destWeight, // Pull the median towards the destination
    });
  }

  if (points.length === 1) {
    const p = points[0]!;
    const lng = Math.atan2(p.y, p.x);
    const hyp = Math.sqrt(p.x * p.x + p.y * p.y);
    const lat = Math.atan2(p.z, hyp);
    return { lat: toDeg(lat), lng: toDeg(lng) };
  }

  // Initialize with the weighted centroid
  let currentX = 0,
    currentY = 0,
    currentZ = 0;
  let totalW = 0;
  for (const p of points) {
    currentX += p.x * p.w;
    currentY += p.y * p.w;
    currentZ += p.z * p.w;
    totalW += p.w;
  }
  currentX /= totalW;
  currentY /= totalW;
  currentZ /= totalW;

  const maxIterations = 100;
  const epsilon = 1e-6; // convergence threshold

  // Weiszfeld's algorithm iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    let sumWeights = 0;

    for (const p of points) {
      // Euclidean distance in 3D
      const d = Math.sqrt(
        Math.pow(p.x - currentX, 2) +
          Math.pow(p.y - currentY, 2) +
          Math.pow(p.z - currentZ, 2),
      );

      // Avoid division by zero if the current estimate lands exactly on a point
      const distance = Math.max(d, 1e-10);
      const weightOverDist = p.w / distance;

      sumX += p.x * weightOverDist;
      sumY += p.y * weightOverDist;
      sumZ += p.z * weightOverDist;
      sumWeights += weightOverDist;
    }

    const nextX = sumX / sumWeights;
    const nextY = sumY / sumWeights;
    const nextZ = sumZ / sumWeights;

    const shift = Math.sqrt(
      Math.pow(nextX - currentX, 2) +
        Math.pow(nextY - currentY, 2) +
        Math.pow(nextZ - currentZ, 2),
    );

    currentX = nextX;
    currentY = nextY;
    currentZ = nextZ;

    if (shift < epsilon) {
      break;
    }
  }

  // Convert the chosen 3D point back to Lat/Lng
  const finalLng = Math.atan2(currentY, currentX);
  const finalHyp = Math.sqrt(currentX * currentX + currentY * currentY);
  const finalLat = Math.atan2(currentZ, finalHyp);

  return { lat: toDeg(finalLat), lng: toDeg(finalLng) };
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
  apiKey: string,
): Promise<{ lat: number; lng: number; name: string; address: string }> {
  const { lat, lng } = centroid;

  // Try to find an accessible meetup location near the centroid
  // Search within 2km radius for meetup-friendly places
  const placeTypes = ["gas_station", "cafe", "restaurant", "parking"];

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
          address: place.vicinity || place.formatted_address || "",
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
        name: "Calculated Meeting Point",
        address: data.results[0].formatted_address,
      };
    }
  } catch (error) {
    console.error("Reverse geocode failed:", error);
  }

  // Ultimate fallback
  return {
    lat,
    lng,
    name: "Calculated Meeting Point",
    address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
  };
}
