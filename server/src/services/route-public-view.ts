/**
 * A route as riders other than its owner see it (plans/privacy-defaults.md,
 * step 6): its owner sees it whole; everyone else sees it without the first
 * and last ~500 m, except an end at a clearly public place, which stays,
 * moved onto that place (core/routes/communityRoute.ts). What is at each end
 * is looked up once, when the route is made public, and kept on the route
 * as `public_ends`. A route made public before that existed has none: both
 * of its ends are trimmed. A community route has no owner and was trimmed
 * when it was kept, so it is shown as it is.
 */
import { planPublicRoute, type PublicPlace, type PublicRoutePlan } from "../core/routes/communityRoute.js";
import { routeLine } from "../core/routes/roadVia.js";
import { orNull, type RoutePlaceLookups } from "./route-place-lookups.js";

type Point = { lat: number; lng: number };

/** What was found at a public route's ends, and the name each end shows. */
export interface PublicEnds {
  startPlace: PublicPlace | null;
  endPlace: PublicPlace | null;
  startName: string | null;
  endName: string | null;
}

export class RouteTooShortError extends Error {
  constructor() {
    super(
      "This route is too short to show other riders without revealing where it starts or ends. Keep it private.",
    );
    this.name = "RouteTooShortError";
  }
}

/**
 * Looks at a route's ends before it is shown to others: a public place at
 * either end, and area names for ends that will be trimmed. Throws
 * RouteTooShortError when too little would be left to show.
 */
export const findPublicEnds = async (
  line: readonly (readonly [number, number])[],
  stops: readonly Point[],
  lookups: RoutePlaceLookups,
): Promise<PublicEnds> => {
  if (line.length < 2) throw new RouteTooShortError();
  const toPoint = ([lng, lat]: readonly [number, number]): Point => ({ lat, lng });
  const [startPlace, endPlace] = await Promise.all([
    orNull(() => lookups.findPublicPlace(toPoint(line[0]!))),
    orNull(() => lookups.findPublicPlace(toPoint(line[line.length - 1]!))),
  ]);
  const plan = planPublicRoute({ line, stops, startPlace, endPlace });
  if (!plan) throw new RouteTooShortError();

  const [startName, endName] = await Promise.all([
    plan.startName ?? orNull(() => lookups.nameArea(plan.start)),
    plan.endName ?? orNull(() => lookups.nameArea(plan.end)),
  ]);
  return { startPlace, endPlace, startName: startName ?? null, endName: endName ?? null };
};

/** A stop as route reads return it, in position order. */
interface StopPoint {
  name: string | null;
  lat: number;
  lng: number;
}

/** The route fields a public view changes, plus what it is worked out from. */
export interface ViewableRoute {
  creator_id: string | null;
  geojson: unknown;
  distance_km: number | string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  start_name: string | null;
  end_name: string | null;
  via: string[];
  via_points?: StopPoint[] | null;
  public_ends?: PublicEnds | null;
}

export type SeenRoute<R extends ViewableRoute> = Omit<R, "via_points" | "public_ends">;

/** What `viewerId` sees of a route, and the public plan it came from (null when shown whole). */
export interface RouteView<R extends ViewableRoute> {
  route: SeenRoute<R>;
  plan: PublicRoutePlan | null;
}

const withoutInternals = <R extends ViewableRoute>(route: R): SeenRoute<R> => {
  const { via_points: _viaPoints, public_ends: _publicEnds, ...rest } = route;
  return rest;
};

/**
 * The route as `viewerId` may see it: whole for its owner and for a
 * community route, else its public view. Null when it is too short to show
 * anyone else.
 */
export const viewRoute = <R extends ViewableRoute>(route: R, viewerId: string): RouteView<R> | null => {
  if (route.creator_id === null || route.creator_id === viewerId) {
    return { route: withoutInternals(route), plan: null };
  }
  const ends = route.public_ends ?? null;
  const stops = route.via_points ?? [];
  const plan = planPublicRoute({
    line: routeLine(route.geojson),
    stops,
    startPlace: ends?.startPlace ?? null,
    endPlace: ends?.endPlace ?? null,
  });
  if (!plan) return null;

  return {
    route: {
      ...withoutInternals(route),
      geojson: { type: "LineString", coordinates: plan.coordinates },
      distance_km: Math.round(plan.lengthMeters / 10) / 100,
      start_lat: plan.start.lat,
      start_lng: plan.start.lng,
      end_lat: plan.end.lat,
      end_lng: plan.end.lng,
      start_name: ends?.startName ?? null,
      end_name: ends?.endName ?? null,
      via: plan.stops.map((stop) => stops[stop.sourceIndex]?.name).filter((name): name is string => Boolean(name)),
    },
    plan,
  };
};
