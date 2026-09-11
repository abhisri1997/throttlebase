/**
 * Where the rider is along a route, and what is left of it.
 *
 * Progress only moves forward and is matched against a short window of road
 * around the last known position. Snapping to the nearest vertex of the whole
 * route — what this replaces — jumps to the wrong pass wherever a route rides
 * the same road out and back, hiding a spur or redrawing road already ridden.
 */
import type { LatLng, NavigationRoute, RouteLeg } from "../types/navigation";
import {
  cumulativeDistances,
  projectOntoPolyline,
  type PolylineProjection,
} from "./geometry";
import { MIN_ARRIVAL_RADIUS_METERS } from "./navigationSession";

/** How far behind the last position a fix may still be matched. */
export const PROGRESS_WINDOW_BEHIND_METERS = 30;
/** How far ahead of the last position a fix may be matched between two fixes. */
export const PROGRESS_WINDOW_AHEAD_METERS = 400;
export const OFF_ROUTE_THRESHOLD_METERS = 60;
/** Below this speed the GPS course is noise, so it isn't used to pick a direction. */
export const HEADING_MIN_SPEED_MPS = 3;
/** A rider further than this from the planned route is sent to the start first. */
export const REJOIN_MAX_OFFSET_METERS = 300;
/** Where a route revisits a road, step ends and rejoining take the first pass. */
const EARLIEST_PASS_TOLERANCE_METERS = 25;

export interface LegGeometry {
  polyline: LatLng[];
  cumulative: number[];
  lengthMeters: number;
  /** Distance along the leg at which each step ends — where its next maneuver happens. */
  stepEndAlongMeters: number[];
}

export const buildLegGeometry = (leg: RouteLeg): LegGeometry => {
  const cumulative = cumulativeDistances(leg.polyline);
  const lengthMeters = cumulative[cumulative.length - 1] ?? 0;

  // Step ends are mapped onto the (simplified) leg polyline by scanning
  // forward, so steps can never come out of order.
  const stepEndAlongMeters: number[] = [];
  let searchFrom = 0;

  for (const step of leg.steps) {
    const projection = projectOntoPolyline(step.end, leg.polyline, cumulative, {
      minAlongMeters: searchFrom,
      preferEarliestWithinMeters: EARLIEST_PASS_TOLERANCE_METERS,
    });
    const along = projection ? projection.distanceAlongMeters : searchFrom;
    stepEndAlongMeters.push(along);
    searchFrom = along;
  }

  // The last step ends where the leg ends, whatever the projection said.
  if (stepEndAlongMeters.length > 0) {
    stepEndAlongMeters[stepEndAlongMeters.length - 1] = lengthMeters;
  }

  return { polyline: leg.polyline, cumulative, lengthMeters, stepEndAlongMeters };
};

export interface LegProgress extends PolylineProjection {
  /** False once the rider is further than OFF_ROUTE_THRESHOLD_METERS from the leg. */
  isOnRoute: boolean;
}

export interface ProgressFix {
  coordinate: LatLng;
  headingDegrees?: number | null;
  speedMps?: number | null;
}

export const startOfLeg = (geometry: LegGeometry, coordinate: LatLng): LegProgress => ({
  distanceAlongMeters: 0,
  offsetMeters: 0,
  segmentIndex: 0,
  point: geometry.polyline[0] ?? coordinate,
  isOnRoute: true,
});

/**
 * Moves progress forward to match a new fix. When the fix matches nothing
 * nearby the rider is off-route: progress stays where it was, so the line
 * doesn't jump, and `isOnRoute` goes false for the caller to reroute on.
 */
export const advanceLegProgress = (
  geometry: LegGeometry,
  fix: ProgressFix,
  previous: LegProgress | null,
): LegProgress => {
  const previousAlong = previous?.distanceAlongMeters ?? 0;
  const useHeading =
    typeof fix.headingDegrees === "number" &&
    Number.isFinite(fix.headingDegrees) &&
    (fix.speedMps ?? 0) >= HEADING_MIN_SPEED_MPS;

  // The first fix on a leg is matched against the whole leg (first pass wins);
  // only once there is a position to be forward of does the window apply.
  // Windowing the first fix to [0, 400 m] would clamp a rider further in onto
  // the window edge and report them on-route there, silently lagging behind.
  const projection = projectOntoPolyline(fix.coordinate, geometry.polyline, geometry.cumulative, {
    ...(previous
      ? {
          minAlongMeters: Math.max(0, previousAlong - PROGRESS_WINDOW_BEHIND_METERS),
          maxAlongMeters: previousAlong + PROGRESS_WINDOW_AHEAD_METERS,
        }
      : { preferEarliestWithinMeters: EARLIEST_PASS_TOLERANCE_METERS }),
    headingDegrees: useHeading ? fix.headingDegrees : null,
  });

  const held = previous ?? startOfLeg(geometry, fix.coordinate);

  if (!projection || projection.offsetMeters > OFF_ROUTE_THRESHOLD_METERS) {
    return {
      ...held,
      offsetMeters: projection?.offsetMeters ?? Number.POSITIVE_INFINITY,
      isOnRoute: false,
    };
  }

  // Never step backwards: jitter behind the last position keeps the old point.
  if (previous && projection.distanceAlongMeters < previousAlong) {
    return { ...previous, offsetMeters: projection.offsetMeters, isOnRoute: true };
  }

  return { ...projection, isOnRoute: true };
};

export interface StepPosition {
  /** Step currently being ridden. */
  stepIndex: number;
  /** Metres to the end of that step, where the next maneuver happens. */
  distanceToManeuverMeters: number;
}

export const locateStep = (
  geometry: LegGeometry,
  distanceAlongMeters: number,
): StepPosition => {
  const ends = geometry.stepEndAlongMeters;

  if (ends.length === 0) {
    return {
      stepIndex: 0,
      distanceToManeuverMeters: Math.max(0, geometry.lengthMeters - distanceAlongMeters),
    };
  }

  const found = ends.findIndex((end) => end > distanceAlongMeters);
  const stepIndex = found === -1 ? ends.length - 1 : found;

  return {
    stepIndex,
    distanceToManeuverMeters: Math.max(
      0,
      (ends[stepIndex] ?? geometry.lengthMeters) - distanceAlongMeters,
    ),
  };
};

export const remainingLegMeters = (geometry: LegGeometry, distanceAlongMeters: number): number =>
  Math.max(0, geometry.lengthMeters - distanceAlongMeters);

/**
 * Seconds left on a leg: the unridden share of the current step plus every
 * later step, scaled by the leg's traffic factor when Google returned one.
 */
export const remainingLegSeconds = (
  leg: RouteLeg,
  geometry: LegGeometry,
  distanceAlongMeters: number,
): number => {
  if (leg.steps.length === 0) {
    const share =
      geometry.lengthMeters > 0
        ? remainingLegMeters(geometry, distanceAlongMeters) / geometry.lengthMeters
        : 0;
    return leg.durationSeconds * share;
  }

  const { stepIndex, distanceToManeuverMeters } = locateStep(geometry, distanceAlongMeters);
  const stepStart = stepIndex === 0 ? 0 : geometry.stepEndAlongMeters[stepIndex - 1] ?? 0;
  const stepEnd = geometry.stepEndAlongMeters[stepIndex] ?? geometry.lengthMeters;
  const stepLength = stepEnd - stepStart;
  const currentShare = stepLength > 0 ? Math.min(1, distanceToManeuverMeters / stepLength) : 0;

  const currentSeconds = (leg.steps[stepIndex]?.durationSeconds ?? 0) * currentShare;
  const laterSeconds = leg.steps
    .slice(stepIndex + 1)
    .reduce((sum, step) => sum + step.durationSeconds, 0);

  const trafficFactor =
    leg.durationInTrafficSeconds && leg.durationSeconds > 0
      ? leg.durationInTrafficSeconds / leg.durationSeconds
      : 1;

  return (currentSeconds + laterSeconds) * trafficFactor;
};

export interface TripGeometry {
  polyline: LatLng[];
  cumulative: number[];
  /** Distance along the planned route at which each waypoint sits (one per waypoint). */
  waypointAlongMeters: number[];
}

/** The planned route as one polyline, with each waypoint's position along it. */
export const buildTripGeometry = (route: NavigationRoute): TripGeometry => {
  const polyline: LatLng[] = [];
  const legEndIndices: number[] = [];

  for (const leg of route.legs) {
    for (const point of leg.polyline) {
      const previous = polyline[polyline.length - 1];
      if (
        !previous ||
        previous.latitude !== point.latitude ||
        previous.longitude !== point.longitude
      ) {
        polyline.push(point);
      }
    }
    legEndIndices.push(Math.max(0, polyline.length - 1));
  }

  const cumulative = cumulativeDistances(polyline);

  return {
    polyline,
    cumulative,
    waypointAlongMeters: [0, ...legEndIndices.map((index) => cumulative[index] ?? 0)],
  };
};

/**
 * Chooses the waypoint a rider opening navigation should head to first.
 *
 * A rider on or near the planned route is placed on it, and every waypoint
 * behind them counts as passed — someone joining at Chettiar Park is not sent
 * back to the start. A rider away from the route heads to the start.
 */
export const placeRiderOnTrip = (location: LatLng, trip: TripGeometry): number => {
  const projection = projectOntoPolyline(location, trip.polyline, trip.cumulative, {
    preferEarliestWithinMeters: EARLIEST_PASS_TOLERANCE_METERS,
  });

  if (!projection || projection.offsetMeters > REJOIN_MAX_OFFSET_METERS) return 0;

  // A waypoint just behind the rider is still reachable: let arrival catch it.
  const reachableFrom = projection.distanceAlongMeters - MIN_ARRIVAL_RADIUS_METERS;
  const index = trip.waypointAlongMeters.findIndex((along) => along >= reachableFrom);

  return index === -1 ? trip.waypointAlongMeters.length - 1 : index;
};
