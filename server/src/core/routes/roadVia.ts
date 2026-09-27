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
/**
 * A fix whose neighbours are this many times closer to each other than the
 * path through it is a spike: a GPS jump, or a U-turn at the end of a lane.
 */
const SPIKE_DETOUR_RATIO = 2.5;
/** Back within this of an earlier point, the track has come back to where it was... */
const SIDE_TRIP_CLOSE_M = 60;
/** ...after at least this far — riding into a stop and out again, or round a block... */
const SIDE_TRIP_MIN_M = 300;
/** ...but no more than this share of the whole route, which would be a loop ride. */
const SIDE_TRIP_MAX_SHARE = 0.25;

type LngLat = [number, number];

const toLatLng = ([lng, lat]: LngLat): LatLng => ({ lat, lng });

const isLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

/** A route's stored GeoJSON line as [lng, lat] pairs; anything unreadable is dropped. */
export const routeLine = (geojson: unknown): LngLat[] => {
  const coordinates = (geojson as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates.filter(isLngLat).map(([lng, lat]) => [lng, lat] as LngLat);
};

/** Drops fixes the track jumped to and straight back from. */
const withoutSpikes = (line: readonly LngLat[]): LngLat[] => {
  const kept: LngLat[] = [];
  for (const coordinate of line) {
    // Each drop can expose the point before it as a spike too, so look back again.
    while (kept.length >= 2) {
      const before = toLatLng(kept[kept.length - 2]!);
      const middle = toLatLng(kept[kept.length - 1]!);
      const after = toLatLng(coordinate);
      const through = haversineMeters(before, middle) + haversineMeters(middle, after);
      if (through <= SPIKE_DETOUR_RATIO * haversineMeters(before, after)) break;
      kept.pop();
    }
    kept.push(coordinate);
  }
  return kept;
};

/** Cuts stretches where the track left the road and came back to the same spot. */
const withoutSideTrips = (line: readonly LngLat[]): LngLat[] => {
  const points = line.map(toLatLng);
  const cumulative = cumulativeDistances(points);
  const maxTripM = SIDE_TRIP_MAX_SHARE * cumulative[cumulative.length - 1]!;

  const kept: LngLat[] = [];
  let index = 0;
  while (index < line.length) {
    kept.push(line[index]!);
    // The furthest return to this spot, so a trip with turns inside it goes in one cut.
    let rejoin = index;
    for (let later = index + 2; later < line.length; later += 1) {
      const tripM = cumulative[later]! - cumulative[index]!;
      if (tripM > maxTripM) break;
      if (tripM >= SIDE_TRIP_MIN_M && haversineMeters(points[index]!, points[later]!) < SIDE_TRIP_CLOSE_M) {
        rejoin = later;
      }
    }
    index = rejoin + 1;
  }
  return kept;
};

/**
 * The road a track describes: its GPS jumps and side trips removed, so a
 * ride is never sent up a lane to where somebody once stopped, or to a fix
 * the phone got wrong.
 */
const roadFromTrack = (line: readonly LngLat[]): LngLat[] => withoutSideTrips(withoutSpikes(line));

/**
 * The points that hold a ride to this road, in the order it was recorded: its
 * sharpest bends, at most MAX_ROAD_VIA_POINTS. A road that one bend or none
 * describes gets none; Google finds that road on its own.
 *
 * There is no reverse: each point lies on the carriageway the road was ridden
 * on, so riding it the other way round Google would U-turn to reach each one.
 */
export const roadViaPoints = (coordinates: readonly LngLat[]): LngLat[] => {
  const road = roadFromTrack(coordinates);
  if (road.length < 3) return [];

  const line = road.map(toLatLng);
  const start = line[0]!;
  const end = line[line.length - 1]!;

  const chosen = mostSignificantPoints(line, MAX_ROAD_VIA_POINTS, MIN_BEND_M)
    .map((index) => road[index]!)
    .filter((coordinate) => {
      const point = toLatLng(coordinate);
      return haversineMeters(point, start) >= MIN_END_GAP_M && haversineMeters(point, end) >= MIN_END_GAP_M;
    });

  return chosen.length < 2 ? [] : chosen;
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
 * Pass-through points before the destination. A leg that ends at the next
 * stop must not be steered through the road beyond that stop and back.
 */
const viaBefore = (origin: LatLng, destination: LatLng, via: readonly LatLng[]): LatLng[] => {
  // The origin opens the line, so a destination before the first point
  // projects before it rather than onto it.
  const line = [origin, ...via];
  const cumulative = cumulativeDistances(line);
  const end = projectOntoPolyline(destination, line, cumulative);

  // The ride's own destination lies past the road's last point, off the line.
  if (end.offsetMeters > ON_ROAD_M) return [...via];
  // via[i] sits at line[i + 1].
  return via.filter((_, index) => cumulative[index + 1]! <= end.distanceAlongMeters);
};

/**
 * Directions waypoints for a ride that follows a road: its stops, with the
 * road's points threaded between them in riding order.
 *
 * Stops keep the captain's order. Each pass-through point goes before the
 * first stop that lies further along the road than it does. Points the rider
 * has already passed are dropped, so a reroute mid-ride never sends them back,
 * and so are points past the destination, so a leg to the next stop ends there.
 * When the two together exceed Google's limit, the road's points are thinned;
 * stops never are.
 */
export const planDirectionsWaypoints = (input: WaypointPlanInput): PlannedWaypoint[] => {
  const stops = input.stopovers.map((point): PlannedWaypoint => ({ point, isVia: false }));
  if (input.via.length === 0) return stops;

  const budget = MAX_DIRECTIONS_WAYPOINTS - stops.length;
  const ahead = viaAhead(input.origin, input.destination, input.via);
  const via = thinEvenly(viaBefore(input.origin, input.destination, ahead), budget);
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
