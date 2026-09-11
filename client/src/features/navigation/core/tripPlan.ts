/**
 * The static shape of a ride for navigation: start, approved stops in planned
 * order, destination. Everything the navigation session and route layers do
 * is expressed against this list.
 */
import { z } from "zod";
import type { LatLng } from "../types/navigation";

export type WaypointKind = "start" | "stop" | "destination";
export type StopCategory = "fuel" | "rest" | "photo" | "unplanned";

export interface TripWaypoint {
  id: string;
  kind: WaypointKind;
  coordinate: LatLng;
  name: string;
  category: StopCategory | null;
  /** 1-based number shown on stop markers; null for start and destination. */
  stopNumber: number | null;
}

/** The parts of the ride payload a trip plan is built from. Ride JSON is untyped, so all of it is checked. */
export interface RideRouteSource {
  start_point_geojson?: { coordinates?: unknown } | null;
  end_point_geojson?: { coordinates?: unknown } | null;
  start_point_name?: string | null;
  end_point_name?: string | null;
  stops?: unknown;
}

export const START_WAYPOINT_ID = "start";
export const DESTINATION_WAYPOINT_ID = "destination";

const STOP_CATEGORIES: readonly StopCategory[] = ["fuel", "rest", "photo", "unplanned"];

const CATEGORY_LABELS: Readonly<Record<StopCategory, string>> = {
  fuel: "Fuel stop",
  rest: "Rest stop",
  photo: "Photo stop",
  unplanned: "Stop",
};

const RideStopSchema = z.object({
  id: z.string().min(1),
  type: z.string().nullish(),
  status: z.string().nullish(),
  name: z.string().nullish(),
  sequence: z.number().nullish(),
  created_at: z.string().nullish(),
  location: z.object({ coordinates: z.array(z.number()) }).nullish(),
});

type RideStop = z.infer<typeof RideStopSchema>;

/** GeoJSON [lng, lat] → LatLng, or null when missing or out of range. */
export const toLatLng = (coordinates: unknown): LatLng | null => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [longitude, latitude] = coordinates as unknown[];
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
};

/** Planned order first; creation time breaks ties and orders stops that have no sequence. */
const compareStops = (left: RideStop, right: RideStop): number => {
  const leftSequence = left.sequence ?? Number.POSITIVE_INFINITY;
  const rightSequence = right.sequence ?? Number.POSITIVE_INFINITY;

  if (leftSequence !== rightSequence) return leftSequence < rightSequence ? -1 : 1;

  return (left.created_at ?? "").localeCompare(right.created_at ?? "");
};

const toCategory = (type: string | null | undefined): StopCategory | null =>
  STOP_CATEGORIES.includes(type as StopCategory) ? (type as StopCategory) : null;

/**
 * Ordered waypoints for navigation. Pending and rejected stops are left out: a
 * request the captain hasn't approved is not part of the route. Returns null
 * when the ride has no usable start or destination.
 */
export const buildTripPlan = (
  ride: RideRouteSource | null | undefined,
): TripWaypoint[] | null => {
  if (!ride) return null;

  const start = toLatLng(ride.start_point_geojson?.coordinates);
  const destination = toLatLng(ride.end_point_geojson?.coordinates);
  if (!start || !destination) return null;

  const rawStops: unknown[] = Array.isArray(ride.stops) ? ride.stops : [];

  const stops = rawStops
    .flatMap((raw) => {
      const parsed = RideStopSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .filter((stop) => stop.status === "approved")
    .flatMap((stop) => {
      const coordinate = toLatLng(stop.location?.coordinates);
      return coordinate ? [{ stop, coordinate }] : [];
    })
    .sort((left, right) => compareStops(left.stop, right.stop));

  return [
    {
      id: START_WAYPOINT_ID,
      kind: "start",
      coordinate: start,
      name: ride.start_point_name?.trim() || "Start",
      category: null,
      stopNumber: null,
    },
    ...stops.map(({ stop, coordinate }, index): TripWaypoint => {
      const category = toCategory(stop.type);
      return {
        id: stop.id,
        kind: "stop",
        coordinate,
        name: stop.name?.trim() || (category ? CATEGORY_LABELS[category] : "Stop"),
        category,
        stopNumber: index + 1,
      };
    }),
    {
      id: DESTINATION_WAYPOINT_ID,
      kind: "destination",
      coordinate: destination,
      name: ride.end_point_name?.trim() || "Destination",
      category: null,
      stopNumber: null,
    },
  ];
};

/** Identifies a trip plan; changes whenever a waypoint is added, removed, reordered or moved. */
export const tripPlanKey = (waypoints: readonly TripWaypoint[]): string =>
  waypoints
    .map(
      (waypoint) =>
        `${waypoint.id}@${waypoint.coordinate.latitude.toFixed(5)},${waypoint.coordinate.longitude.toFixed(5)}`,
    )
    .join("|");
