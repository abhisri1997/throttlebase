/**
 * Riding a route's road rather than whatever road Google prefers.
 *
 * A route is a line someone actually rode. To send a new ride down the same
 * road, Directions is given a handful of points along it as pass-through
 * waypoints (`via:`): they bend Google's route without adding stops, legs or
 * turn-by-turn "arrive" instructions.
 */
import { haversineMeters, projectOntoPolyline, cumulativeDistances, type LatLng } from "../../utils/polyline.js";
import { mostSignificantPoints } from "./simplifyLine.js";

/** Enough to hold a long ride to its road; each one is a waypoint Google bills for. */
export const MAX_ROAD_VIA_POINTS = 20;
/** Google Directions accepts at most this many waypoints, stops and pass-throughs together. */
export const MAX_DIRECTIONS_WAYPOINTS = 25;
/** A bend shallower than this does not tell one road from the next. */
const MIN_BEND_M = 100;
/** Near the ends the ride's own start and destination already fix the road. */
const MIN_END_GAP_M = 1000;
/** Closer than this to the road, a rider is on it and has passed the points behind them. */
const ON_ROAD_M = 1000;

type LngLat = [number, number];

const toLatLng = ([lng, lat]: LngLat): LatLng => ({ lat, lng });

/**
 * The points that hold a ride to this road, in riding order: its sharpest
 * bends, at most MAX_ROAD_VIA_POINTS. A road that one bend or none describes
 * gets none; Google finds that road on its own.
 */
export const roadViaPoints = (
  coordinates: readonly LngLat[],
  options: { reverse: boolean },
): LngLat[] => {
  if (coordinates.length < 3) return [];

  const line = coordinates.map(toLatLng);
  const start = line[0]!;
  const end = line[line.length - 1]!;

  const chosen = mostSignificantPoints(line, MAX_ROAD_VIA_POINTS, MIN_BEND_M)
    .map((index) => coordinates[index]!)
    .filter((coordinate) => {
      const point = toLatLng(coordinate);
      return haversineMeters(point, start) >= MIN_END_GAP_M && haversineMeters(point, end) >= MIN_END_GAP_M;
    });

  if (chosen.length < 2) return [];
  return options.reverse ? [...chosen].reverse() : chosen;
};

export interface WaypointPlanInput {
  origin: LatLng;
  destination: LatLng;
  /** The ride's stops, in the order the captain planned them. */
  stopovers: readonly LatLng[];
  /** The road's pass-through points, in riding order. */
  via: readonly LatLng[];
}

export interface PlannedWaypoint {
  point: LatLng;
  isVia: boolean;
}

/** Keeps `count` of `points`, spread evenly, first and last included. */
const thinEvenly = <T>(points: readonly T[], count: number): T[] => {
  if (points.length <= count) return [...points];
  if (count <= 0) return [];
  if (count === 1) return [points[0]!];
  const stride = (points.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => points[Math.round(i * stride)]!);
};

/** Pass-through points the rider has not reached yet. */
const viaAhead = (origin: LatLng, destination: LatLng, via: readonly LatLng[]): LatLng[] => {
  // The destination closes the line, so a rider between the last point and
  // the destination projects past that point rather than onto it.
  const line = [...via, destination];
  const cumulative = cumulativeDistances(line);
  const rider = projectOntoPolyline(origin, line, cumulative);

  // Someone still riding to the start is not on the road, so nothing is behind them.
  if (rider.offsetMeters > ON_ROAD_M) return [...via];
  return via.filter((_, index) => cumulative[index]! >= rider.distanceAlongMeters);
};

/**
 * Directions waypoints for a ride that follows a road: its stops, with the
 * road's points threaded between them in riding order.
 *
 * Stops keep the captain's order. Each pass-through point goes before the
 * first stop that lies further along the road than it does. Points the rider
 * has already passed are dropped, so a reroute mid-ride never sends them back.
 * When the two together exceed Google's limit, the road's points are thinned;
 * stops never are.
 */
export const planDirectionsWaypoints = (input: WaypointPlanInput): PlannedWaypoint[] => {
  const stops = input.stopovers.map((point): PlannedWaypoint => ({ point, isVia: false }));
  if (input.via.length === 0) return stops;

  const budget = MAX_DIRECTIONS_WAYPOINTS - stops.length;
  const via = thinEvenly(viaAhead(input.origin, input.destination, input.via), budget);
  if (via.length === 0) return stops;

  const line = [input.origin, ...via, input.destination];
  const cumulative = cumulativeDistances(line);
  // via[i] sits at line[i + 1].
  const viaAlong = via.map((_, index) => cumulative[index + 1]!);

  const planned: PlannedWaypoint[] = [];
  let nextVia = 0;
  let reached = 0;
  for (const stop of stops) {
    // A stop planned after one further along keeps its place in the plan.
    reached = Math.max(reached, projectOntoPolyline(stop.point, line, cumulative).distanceAlongMeters);
    while (nextVia < via.length && viaAlong[nextVia]! < reached) {
      planned.push({ point: via[nextVia]!, isVia: true });
      nextVia += 1;
    }
    planned.push(stop);
  }
  for (; nextVia < via.length; nextVia += 1) {
    planned.push({ point: via[nextVia]!, isVia: true });
  }
  return planned;
};
