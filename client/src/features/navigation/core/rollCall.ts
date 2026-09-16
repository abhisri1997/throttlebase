/**
 * Who is actually at the start when the captain is about to set off.
 *
 * Riders only report a position once they have joined the live session, so
 * three states matter and each needs a different response: someone at the
 * start is ready, someone en route can be waited for, and someone with no
 * position at all has not opened the app — that is the rider you ring.
 */
import type { LatLng } from "../types/navigation";
import { haversineMeters } from "./geometry";

/** Riders gather across a car park or lay-by, so this is wider than an arrival radius. */
export const AT_START_RADIUS_METERS = 100;

export type RollCallState = "at_start" | "en_route" | "no_location";

export interface RollCallRider {
  riderId: string;
  displayName: string;
  role: "captain" | "co_captain" | "member";
}

export interface RollCallEntry extends RollCallRider {
  state: RollCallState;
  /** Metres from the start point; null while their position is unknown. */
  distanceMeters: number | null;
}

export interface RollCallInput {
  riders: readonly RollCallRider[];
  /** Live positions by rider id, as broadcast to the session. */
  locations: Readonly<Record<string, { lat: number; lon: number } | undefined>>;
  start: LatLng;
  radiusMeters?: number;
}

export const buildRollCall = ({
  riders,
  locations,
  start,
  radiusMeters = AT_START_RADIUS_METERS,
}: RollCallInput): RollCallEntry[] =>
  riders.map((rider): RollCallEntry => {
    const location = locations[rider.riderId];

    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
      return { ...rider, state: "no_location", distanceMeters: null };
    }

    const distanceMeters = haversineMeters(
      { latitude: location.lat, longitude: location.lon },
      start,
    );

    return {
      ...rider,
      state: distanceMeters <= radiusMeters ? "at_start" : "en_route",
      distanceMeters,
    };
  });

export interface RollCallSummary {
  atStart: RollCallEntry[];
  enRoute: RollCallEntry[];
  noLocation: RollCallEntry[];
  /** True when anyone is not yet at the start — what the captain is nudged about. */
  hasAbsentees: boolean;
}

/** Groups the roll call, nearest first among those still on their way. */
export const summarizeRollCall = (entries: readonly RollCallEntry[]): RollCallSummary => {
  const atStart = entries.filter((entry) => entry.state === "at_start");
  const enRoute = entries
    .filter((entry) => entry.state === "en_route")
    .sort((left, right) => (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0));
  const noLocation = entries.filter((entry) => entry.state === "no_location");

  return {
    atStart,
    enRoute,
    noLocation,
    hasAbsentees: enRoute.length > 0 || noLocation.length > 0,
  };
};
