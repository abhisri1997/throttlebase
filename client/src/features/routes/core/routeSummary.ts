/**
 * How a route reads at a glance: where it goes, its facts, its highlights and
 * a drawing of its shape. Shared by the Routes cards and the route page.
 */
import { formatDistance, formatDuration } from "../../navigation/core/format";
import { highlightLabel } from "./highlights";

export interface RouteSummaryInput {
  title: string;
  start_name: string | null;
  end_name: string | null;
  /** Postgres NUMERIC arrives as a string. */
  distance_km: number | string | null;
  ridden_duration_s: number | null;
  via: readonly string[];
  highlights: readonly string[];
}

/** "Electronic City, Doddathoguru" → "Electronic City": the area, without its city. */
export const shortPlace = (areaName: string): string => areaName.split(",")[0]!.trim();

/** "Electronic City → HSR Layout", "Loop from Indiranagar", or null without both ends. */
export const placesHeadline = (startName: string | null, endName: string | null): string | null => {
  if (!startName || !endName) return null;
  const start = shortPlace(startName);
  const end = shortPlace(endName);
  return start === end ? `Loop from ${start}` : `${start} → ${end}`;
};

/** "via Infosys Campus Building 37 · Mysuru": stops by place, not full address. */
export const viaLine = (via: readonly string[]): string | null =>
  via.length > 0 ? `via ${via.map(shortPlace).join(" · ")}` : null;

export const routeHeadline = (route: RouteSummaryInput): string =>
  placesHeadline(route.start_name, route.end_name) ?? route.title;

/** ["14 km", "36 min", "1 stop"], leaving out whatever isn't known. */
export const routeFacts = (route: RouteSummaryInput): string[] => {
  const distanceKm = Number(route.distance_km);
  const facts: string[] = [];
  if (route.distance_km != null && Number.isFinite(distanceKm) && distanceKm > 0) {
    facts.push(formatDistance(distanceKm * 1000));
  }
  if (route.ridden_duration_s != null && route.ridden_duration_s > 0) {
    facts.push(formatDuration(route.ridden_duration_s));
  }
  if (route.via.length > 0) {
    facts.push(`${route.via.length} ${route.via.length === 1 ? "stop" : "stops"}`);
  }
  return facts;
};

export const highlightChips = (
  highlights: readonly string[],
  max: number,
): { labels: string[]; more: number } => {
  const labels = highlights.map(highlightLabel).filter((label): label is string => label !== null);
  return { labels: labels.slice(0, max), more: Math.max(0, labels.length - max) };
};

export interface ShapeBox {
  width: number;
  height: number;
  padding: number;
}

/**
 * The route's line fitted into a box, north up, keeping its proportions.
 * Longitude is scaled by the cosine of the latitude so an east-west route in
 * Bengaluru isn't drawn stretched.
 */
export const routeShapePoints = (
  coordinates: readonly (readonly number[])[],
  box: ShapeBox,
): { x: number; y: number }[] | null => {
  const points = coordinates
    .filter((point) => point.length >= 2)
    .map((point): [number, number] => [point[0]!, point[1]!]);
  if (points.length < 2) return null;

  const midLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map(([lng]) => lng * lngScale);
  const ys = points.map(([, lat]) => lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const innerWidth = box.width - box.padding * 2;
  const innerHeight = box.height - box.padding * 2;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(
    spanX > 0 ? innerWidth / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? innerHeight / spanY : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(scale)) return null;

  // Centre the drawing in whichever direction it doesn't fill.
  const offsetX = box.padding + (innerWidth - spanX * scale) / 2;
  const offsetY = box.padding + (innerHeight - spanY * scale) / 2;
  const round = (value: number) => Math.round(value * 100) / 100;

  return points.map((_, index) => ({
    x: round(offsetX + (xs[index]! - minX) * scale),
    y: round(offsetY + (maxY - ys[index]!) * scale),
  }));
};

/** The fitted line as an SVG path. */
export const routeShapePath = (coordinates: readonly (readonly number[])[], box: ShapeBox): string | null =>
  routeShapePoints(coordinates, box)
    ?.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ") ?? null;

export interface RouteStopDetail {
  position: number;
  name: string | null;
  note: string | null;
  distance_from_start_km: number | string | null;
}

export interface ItineraryRow {
  /** "A", "1", "2", …, "B": matches the map's markers. */
  marker: string;
  kind: "start" | "stop" | "destination";
  /** The place itself, e.g. "Infosys Campus Building 37". */
  name: string;
  /** The rest of a stop's address, shown smaller; null for area names. */
  detail: string | null;
  /** Distance along the route, e.g. "146 km"; null when unknown. */
  distance: string | null;
  note: string | null;
}

const kmLabel = (km: number | string | null): string | null => {
  const value = Number(km);
  return km != null && Number.isFinite(value) && value > 0 ? formatDistance(value * 1000) : null;
};

/** Stops are often named by a full address; lead with the place, keep the rest as detail. */
export const splitPlaceName = (name: string): { name: string; detail: string | null } => {
  const [place, ...rest] = name.split(",").map((part) => part.trim());
  return { name: place || name, detail: rest.length > 0 ? rest.join(", ") : null };
};

const splitStopName = (name: string | null, position: number): { name: string; detail: string | null } =>
  name ? splitPlaceName(name) : { name: `Stop ${position}`, detail: null };

/** A to B through every stop, in order, as the route page lists them. */
export const itineraryRows = (route: {
  start_name: string | null;
  end_name: string | null;
  distance_km: number | string | null;
  stops: readonly RouteStopDetail[];
}): ItineraryRow[] => [
  // formatDistance would print "0 m"; every other row reads in km.
  { marker: "A", kind: "start", name: route.start_name ?? "Start", detail: null, distance: "0 km", note: null },
  ...route.stops.map(
    (stop): ItineraryRow => ({
      marker: String(stop.position),
      kind: "stop",
      ...splitStopName(stop.name, stop.position),
      distance: kmLabel(stop.distance_from_start_km),
      note: stop.note,
    }),
  ),
  {
    marker: "B",
    kind: "destination",
    name: route.end_name ?? "Destination",
    detail: null,
    distance: kmLabel(route.distance_km),
    note: null,
  },
];
