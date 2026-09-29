/**
 * A deleted rider's public route, kept for the community without anything
 * that leads back to them (docs/launch-readiness/plans/account-deletion.md,
 * decision B). A route that starts or ends at someone's home identifies them
 * without a name, so for each end:
 *
 *   * at a clearly public place (a hotel, fuel station, café, viewpoint…),
 *     the end is kept, moved onto that place and named after it: many
 *     people start there, so it points at nobody;
 *   * anywhere else, about 500 m comes off it, and it moves to the new line.
 *
 * With an end trimmed, a route with under 5 km left isn't kept at all: a
 * short loop is mostly its ends. Stops in trimmed ends go and the rest are
 * renumbered. The title is made from the ends' names, so none of the rider's
 * own words survive.
 *
 * Pure: the caller finds the places, looks up area names and writes.
 */
import { haversineMeters, type LatLng } from "../../utils/polyline.js";

/** Taken off each end that isn't at a public place. */
export const END_TRIM_METERS = 500;

/** Shorter than this after trimming, a route is deleted instead of kept. */
export const MIN_KEPT_METERS = 5_000;

/** How close a public place must be to a route end for the end to stay there. */
export const PUBLIC_PLACE_RADIUS_METERS = 50;

/**
 * Places an end may be kept at: open to anyone, where many riders start.
 * Google Places (New) Table A types.
 */
export const PUBLIC_PLACE_TYPES: readonly string[] = [
  "hotel",
  "resort_hotel",
  "motel",
  "gas_station",
  "electric_vehicle_charging_station",
  "cafe",
  "coffee_shop",
  "restaurant",
  "tourist_attraction",
  "observation_deck",
  "park",
  "national_park",
  "parking",
  "rest_stop",
  "train_station",
  "bus_station",
  "transit_station",
];

/**
 * Where people live, or stay as if at home. A place of any of these types is
 * never taken as public, even if it is listed as a hotel or café too.
 */
export const HOME_LIKE_PLACE_TYPES: readonly string[] = [
  "extended_stay_hotel",
  "inn",
  "guest_house",
  "private_guest_room",
  "farmstay",
  "cottage",
  "bed_and_breakfast",
  "hostel",
  "apartment_building",
  "apartment_complex",
  "condominium_complex",
  "housing_complex",
];

export type LngLat = readonly [number, number];

/** A public place found at a route end. */
export interface PublicPlace {
  name: string;
  lat: number;
  lng: number;
}

/** Meters taken off each end. */
export interface EndTrim {
  start: number;
  end: number;
}

const BOTH_ENDS: EndTrim = { start: END_TRIM_METERS, end: END_TRIM_METERS };

export interface TrimmedLine {
  coordinates: [number, number][];
  lengthMeters: number;
  start: LatLng;
  end: LatLng;
}

export interface KeptStop {
  position: number;
  lat: number;
  lng: number;
  distanceFromStartKm: number;
}

const toLatLng = ([lng, lat]: LngLat): LatLng => ({ lat, lng });
const toPair = ([lng, lat]: LngLat): [number, number] => [lng, lat];

/** Distance from the start of the line to each of its points. */
const cumulativeMeters = (line: readonly LngLat[]): number[] =>
  line.reduce<number[]>((sums, point, index) => {
    if (index === 0) return [0];
    return [...sums, sums[index - 1]! + haversineMeters(toLatLng(line[index - 1]!), toLatLng(point))];
  }, []);

/** The point `meters` along the line, between its two nearest points. */
const pointAt = (line: readonly LngLat[], sums: readonly number[], meters: number): [number, number] => {
  const after = sums.findIndex((sum) => sum >= meters);
  if (after <= 0) return toPair(line[0]!);
  const before = after - 1;
  const span = sums[after]! - sums[before]!;
  const fraction = span === 0 ? 0 : (meters - sums[before]!) / span;
  const [lngA, latA] = line[before]!;
  const [lngB, latB] = line[after]!;
  return [lngA + (lngB - lngA) * fraction, latA + (latB - latA) * fraction];
};

/** The line with `trim` meters off each end; null when too little would be left to keep. */
export const trimLineEnds = (line: readonly LngLat[], trim: EndTrim = BOTH_ENDS): TrimmedLine | null => {
  if (line.length < 2) return null;
  const sums = cumulativeMeters(line);
  const total = sums[sums.length - 1]!;
  const lengthMeters = total - trim.start - trim.end;
  const isTrimmed = trim.start > 0 || trim.end > 0;
  if (lengthMeters <= 0 || (isTrimmed && lengthMeters < MIN_KEPT_METERS)) return null;

  const first = trim.start > 0 ? pointAt(line, sums, trim.start) : toPair(line[0]!);
  const last = trim.end > 0 ? pointAt(line, sums, total - trim.end) : toPair(line[line.length - 1]!);
  const inside = line.filter((_, index) => sums[index]! > trim.start && sums[index]! < total - trim.end).map(toPair);
  const coordinates = [first, ...inside, last];

  return { coordinates, lengthMeters, start: toLatLng(first), end: toLatLng(last) };
};

/**
 * How far along the line a place lies: where it meets the line, on the
 * segment closest to it. Segments are short enough to treat as flat.
 */
const metersAlong = (line: readonly LngLat[], sums: readonly number[], place: LatLng): number => {
  let best = { gap: Number.POSITIVE_INFINITY, along: 0 };
  for (let index = 0; index < line.length - 1; index += 1) {
    const [lngA, latA] = line[index]!;
    const [lngB, latB] = line[index + 1]!;
    const scale = Math.cos((latA * Math.PI) / 180);
    const [dx, dy] = [(lngB - lngA) * scale, latB - latA];
    const [px, py] = [(place.lng - lngA) * scale, place.lat - latA];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSquared));
    const onLine = { lat: latA + (latB - latA) * t, lng: lngA + (lngB - lngA) * t };
    const gap = haversineMeters(onLine, place);
    if (gap < best.gap) best = { gap, along: sums[index]! + t * (sums[index + 1]! - sums[index]!) };
  }
  return best.along;
};

const roundKm = (meters: number): number => Math.round(meters / 10) / 100;

/**
 * The stops a kept route keeps: those along its kept part, in order along
 * the road, measured from its new start. `line` is the untrimmed line.
 */
export const keptStops = (line: readonly LngLat[], stops: readonly LatLng[], trim: EndTrim = BOTH_ENDS): KeptStop[] => {
  if (line.length < 2) return [];
  const sums = cumulativeMeters(line);
  const total = sums[sums.length - 1]!;
  return stops
    .map((stop) => ({ stop, along: metersAlong(line, sums, stop) }))
    .filter(({ along }) => along > trim.start && along < total - trim.end)
    .sort((a, b) => a.along - b.along)
    .map(({ stop, along }, index) => ({
      position: index + 1,
      lat: stop.lat,
      lng: stop.lng,
      distanceFromStartKm: roundKm(along - trim.start),
    }));
};

export interface CommunityRouteInput {
  line: readonly LngLat[];
  stops: readonly LatLng[];
  /** A public place within PUBLIC_PLACE_RADIUS_METERS of each end; null when none was found. */
  startPlace: PublicPlace | null;
  endPlace: PublicPlace | null;
}

export interface CommunityRoutePlan extends TrimmedLine {
  /** The public place's name for a kept end; null for a trimmed one, to be named by area. */
  startName: string | null;
  endName: string | null;
  stops: KeptStop[];
}

/** What the route becomes; null when it isn't kept. */
export const planCommunityRoute = ({ line, stops, startPlace, endPlace }: CommunityRouteInput): CommunityRoutePlan | null => {
  if (line.length < 2) return null;
  // A kept end sits on its place, not on the rider's own GPS fix.
  const snapped = line.map((point, index): LngLat => {
    if (index === 0 && startPlace) return [startPlace.lng, startPlace.lat];
    if (index === line.length - 1 && endPlace) return [endPlace.lng, endPlace.lat];
    return point;
  });
  const trim: EndTrim = {
    start: startPlace ? 0 : END_TRIM_METERS,
    end: endPlace ? 0 : END_TRIM_METERS,
  };

  const trimmed = trimLineEnds(snapped, trim);
  if (!trimmed) return null;
  return {
    ...trimmed,
    startName: startPlace?.name ?? null,
    endName: endPlace?.name ?? null,
    stops: keptStops(snapped, stops, trim),
  };
};

/** "HSR Layout, Bengaluru" → "HSR Layout". */
const shortName = (name: string | null): string | null => name?.split(",")[0]?.trim() || null;

export const communityRouteTitle = (startName: string | null, endName: string | null): string => {
  const from = shortName(startName);
  const to = shortName(endName);
  if (from && to) return from === to ? `${from} loop` : `${from} to ${to}`;
  if (from) return `Route from ${from}`;
  if (to) return `Route to ${to}`;
  return "Community route";
};
