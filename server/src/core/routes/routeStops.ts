/**
 * The stops a saved route keeps from its ride.
 *
 * The saver chooses from what the ride actually had: the planned stops they
 * rode past, and the stops they found on the way (somewhere they got off that
 * wasn't planned). Planned stops they never went near are listed as skipped
 * and can't be kept. Each stop sits where the bike was parked and is measured
 * along the route; the saver can add a note, and name a stop they found.
 */
import { cumulativeDistances, projectOntoPolyline, type LatLng } from "../../utils/polyline.js";
import type { RideStop } from "../ride-progress/segmentRide.js";

/** A planned stop further than this from the recorded line was not visited on the ride. */
export const MAX_STOP_OFFSET_M = 1000;

export interface RideStopForRoute {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
}

export type StopChoiceStatus = "visited" | "skipped" | "found";

/** One stop the saver can keep or leave, as the save sheet lists it. */
export interface StopChoice {
  /** "planned:<ride stop id>" or "found:<when the rider stopped>"; the same on preview and save. */
  key: string;
  kind: "planned" | "discovered";
  /** The planned ride stop, for a planned one. */
  rideStopId: string | null;
  /** A found stop has none until the saver names it or its area is looked up. */
  name: string | null;
  lat: number;
  lng: number;
  /** Along the route; null for a skipped stop, which isn't on it. */
  distanceFromStartKm: number | null;
  status: StopChoiceStatus;
  /** How long the rider was off the bike there, when they got off. */
  stoppedS: number | null;
  walkedAway: boolean;
  /** Ticked to start with: stops on the way, and places the rider walked off to. */
  suggested: boolean;
}

export interface RouteStopDraft {
  key: string;
  position: number;
  name: string | null;
  lat: number;
  lng: number;
  note: string | null;
  distanceFromStartKm: number;
}

export interface KeptStop {
  note?: string | null;
  /** Only used for a stop the rider found; planned stops keep their name. */
  name?: string | null;
}

/**
 * Moves each planned stop the rider parked for to where the bike was. A stop is
 * often somewhere a bike can't go (a campus, a market, a temple); the route
 * sends the next ride to the parking, and keeps the place's name.
 */
export const placeAtParking = (
  rideStops: readonly RideStopForRoute[],
  parkings: readonly { plannedStopId: string | null; parkedAt: LatLng }[],
): RideStopForRoute[] =>
  rideStops.map((stop) => {
    const parking = parkings.find((entry) => entry.plannedStopId === stop.id);
    return parking ? { ...stop, lat: parking.parkedAt.lat, lng: parking.parkedAt.lng } : stop;
  });

const roundKm = (metres: number): number => Math.round(metres / 10) / 100;

/** Everything the saver can choose from, in road order, skipped stops last. */
export const stopChoices = (input: {
  /** The saved route's line, GeoJSON order: [longitude, latitude]. */
  coordinates: readonly [number, number][];
  /** The distance actually ridden; the simplified line is a little shorter. */
  routeDistanceKm: number;
  /** In the ride's order. */
  plannedStops: readonly RideStopForRoute[];
  /** Where the rider got off, from segmentRide. */
  rideStops: readonly RideStop[];
}): StopChoice[] => {
  const line: LatLng[] = input.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const cumulative = cumulativeDistances(line);
  const lineLengthM = cumulative[cumulative.length - 1] ?? 0;
  const scale = lineLengthM > 0 ? (input.routeDistanceKm * 1000) / lineLengthM : 1;
  const along = (point: LatLng) => projectOntoPolyline(point, line, cumulative);

  const planned = placeAtParking(input.plannedStops, input.rideStops).map((stop): StopChoice => {
    const projection = along(stop);
    const isOnTheWay = projection.offsetMeters <= MAX_STOP_OFFSET_M;
    const stopped = input.rideStops.find((rideStop) => rideStop.plannedStopId === stop.id);
    return {
      key: `planned:${stop.id}`,
      kind: "planned",
      rideStopId: stop.id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      distanceFromStartKm: isOnTheWay ? roundKm(projection.distanceAlongMeters * scale) : null,
      status: isOnTheWay ? "visited" : "skipped",
      stoppedS: stopped?.durationS ?? null,
      walkedAway: stopped?.walkedAway ?? false,
      suggested: isOnTheWay,
    };
  });

  const found = input.rideStops
    .filter((rideStop) => rideStop.plannedStopId === null)
    .map((rideStop): StopChoice => ({
      key: `found:${rideStop.startedAtMs}`,
      kind: "discovered",
      rideStopId: null,
      name: null,
      lat: rideStop.parkedAt.lat,
      lng: rideStop.parkedAt.lng,
      distanceFromStartKm: roundKm(along(rideStop.parkedAt).distanceAlongMeters * scale),
      status: "found",
      stoppedS: rideStop.durationS,
      walkedAway: rideStop.walkedAway,
      // Off the bike somewhere: worth keeping. Beside the bike: a stretch or a
      // standstill as likely as a place, so the rider decides.
      suggested: rideStop.walkedAway,
    }));

  const onTheWay = [...planned, ...found]
    .filter((choice) => choice.status !== "skipped")
    .sort((a, b) => a.distanceFromStartKm! - b.distanceFromStartKm!);
  return [...onTheWay, ...planned.filter((choice) => choice.status === "skipped")];
};

const trimmedOrNull = (text: string | null | undefined): string | null => text?.trim() || null;

/** The stops the route saves: those the rider kept, numbered in road order. */
export const keptRouteStops = (
  choices: readonly StopChoice[],
  kept: ReadonlyMap<string, KeptStop>,
): RouteStopDraft[] =>
  choices
    .filter((choice) => choice.status !== "skipped" && kept.has(choice.key))
    .map((choice, index) => {
      const keep = kept.get(choice.key)!;
      return {
        key: choice.key,
        position: index + 1,
        name: choice.kind === "discovered" ? trimmedOrNull(keep.name) ?? choice.name : choice.name,
        lat: choice.lat,
        lng: choice.lng,
        note: trimmedOrNull(keep.note),
        distanceFromStartKm: choice.distanceFromStartKm!,
      };
    });
