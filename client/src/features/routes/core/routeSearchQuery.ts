/**
 * Turning the Routes search panel into a request, and a result's match into
 * words: "Starts 7.8 km from Bengaluru · ends in Sulthan Bathery".
 */
import { shortPlace } from "./routeSummary";

export interface SearchPlace {
  lat: number;
  lng: number;
  /** As the place picker labels it, e.g. "Wayanad, Kerala, India". */
  name: string;
}

export const LENGTH_FILTERS = [
  { id: "any", label: "Any length", minKm: null, maxKm: null },
  { id: "short", label: "Under 100 km", minKm: null, maxKm: 100 },
  { id: "day", label: "100–300 km", minKm: 100, maxKm: 300 },
  { id: "long", label: "300+ km", minKm: 300, maxKm: null },
] as const;

export type LengthFilterId = (typeof LENGTH_FILTERS)[number]["id"];

export interface RouteSearchState {
  from: SearchPlace | null;
  to: SearchPlace | null;
  lengthId: LengthFilterId;
  highlights: readonly string[];
}

/** The query string for GET /api/routes/search, or null when nothing is being searched. */
export const buildRouteSearchParams = (state: RouteSearchState): string | null => {
  const length = LENGTH_FILTERS.find((filter) => filter.id === state.lengthId) ?? LENGTH_FILTERS[0];
  const params = new URLSearchParams();

  for (const [prefix, place] of [
    ["from", state.from],
    ["to", state.to],
  ] as const) {
    if (!place) continue;
    params.set(`${prefix}_lat`, String(place.lat));
    params.set(`${prefix}_lng`, String(place.lng));
    params.set(`${prefix}_name`, place.name);
  }
  if (length.minKm !== null) params.set("min_km", String(length.minKm));
  if (length.maxKm !== null) params.set("max_km", String(length.maxKm));
  if (state.highlights.length > 0) params.set("highlights", state.highlights.join(","));

  const query = params.toString();
  return query ? query : null;
};

export interface RouteMatchInfo {
  direction: "forward" | "reverse";
  start_gap_km: number | null;
  end_gap_km: number | null;
}

/** Closer than this, the route starts or ends in the place itself. */
const IN_PLACE_KM = 0.5;

const gapPhrase = (gapKm: number, placeName: string): string => {
  const place = shortPlace(placeName);
  if (gapKm < IN_PLACE_KM) return `in ${place}`;
  const distance = gapKm < 10 ? gapKm.toFixed(1) : String(Math.round(gapKm));
  return `${distance} km from ${place}`;
};

/** How far the result starts and ends from what was searched, or null for a filter-only search. */
export const matchNote = (
  match: RouteMatchInfo,
  fromName: string | null,
  toName: string | null,
): string | null => {
  const parts = [
    match.start_gap_km !== null && fromName ? `starts ${gapPhrase(match.start_gap_km, fromName)}` : null,
    match.end_gap_km !== null && toName ? `ends ${gapPhrase(match.end_gap_km, toName)}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;

  const note = parts.join(" · ");
  return note.charAt(0).toUpperCase() + note.slice(1);
};
