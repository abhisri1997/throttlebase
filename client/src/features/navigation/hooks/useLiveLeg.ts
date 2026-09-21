import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceLegProgress,
  buildLegGeometry,
  type LegGeometry,
  type LegProgress,
} from "../core/routeProgress";
import type { TripWaypoint } from "../core/tripPlan";
import {
  DEFAULT_ROUTE_DEVIATION_GRACE_MS,
  DEFAULT_ROUTE_REROUTE_COOLDOWN_MS,
  fetchLiveLeg,
} from "../services/navigationRouteService";
import type { NavigationFix, NavigationRoute, RouteLeg } from "../types/navigation";

/**
 * Traffic changes slowly; refreshing the ETA more often than this only bills
 * more. Every rider on a ride refreshes independently, so this interval is the
 * single biggest driver of Directions spend — override it per screen rather
 * than lowering it globally.
 */
export const LIVE_LEG_TRAFFIC_REFRESH_MS = 5 * 60 * 1000;
const TRAFFIC_CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Last traffic-driven fetch, shared by every mount of this hook.
 *
 * The per-mount timer alone would let two components showing the same leg
 * refresh twice per interval and bill twice. Only one leg is ever active, so a
 * single record is enough and cannot grow.
 */
const lastTrafficFetch: { targetId: string | null; at: number } = {
  targetId: null,
  at: 0,
};

export type LiveLegStatus = "idle" | "loading" | "rerouting" | "ready";
type FetchReason = "leg-start" | "reroute" | "traffic";

interface UseLiveLegInput {
  /** Waypoint being ridden to; null while waiting at a stop or once finished. */
  target: TripWaypoint | null;
  fix: NavigationFix | null;
  /** App in the foreground. The traffic refresh pauses in the background. */
  isActive: boolean;
  /** Overrides how often the ETA is refreshed for traffic. */
  trafficRefreshMs?: number;
}

export interface LiveLegState {
  route: NavigationRoute | null;
  leg: RouteLeg | null;
  geometry: LegGeometry | null;
  progress: LegProgress | null;
  status: LiveLegStatus;
  isOffRoute: boolean;
}

/**
 * The leg being ridden, fetched live from the rider's position so traffic and
 * route alternatives apply. It is fetched only when a leg starts, when the
 * rider has been off-route for the grace period, and for an occasional traffic
 * refresh — never on a timer tied to movement.
 */
export const useLiveLeg = ({
  target,
  fix,
  isActive,
  trafficRefreshMs = LIVE_LEG_TRAFFIC_REFRESH_MS,
}: UseLiveLegInput): LiveLegState => {
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [progress, setProgress] = useState<LegProgress | null>(null);
  const [status, setStatus] = useState<LiveLegStatus>("idle");

  const requestIdRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  // Mirrors `route` so fetchLeg can consult it without being re-created.
  const routeRef = useRef<NavigationRoute | null>(route);
  routeRef.current = route;
  const offRouteSinceRef = useRef<number | null>(null);
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const targetRef = useRef(target);
  targetRef.current = target;

  const targetId = target?.id ?? null;
  const hasFix = fix !== null;

  const leg = route?.legs[0] ?? null;
  const geometry = useMemo(() => (leg ? buildLegGeometry(leg) : null), [leg]);

  const fetchLeg = useCallback(async (reason: FetchReason) => {
    const currentTarget = targetRef.current;
    const currentFix = fixRef.current;
    if (!currentTarget || !currentFix) return;

    const requestId = ++requestIdRef.current;
    lastFetchAtRef.current = Date.now();
    lastTrafficFetch.targetId = currentTarget.id;
    lastTrafficFetch.at = lastFetchAtRef.current;

    // A traffic refresh swaps the route quietly; only real changes show a status.
    if (reason !== "traffic") {
      setStatus(reason === "reroute" ? "rerouting" : "loading");
    }

    const next = await fetchLiveLeg(currentFix.coordinate, currentTarget.coordinate);

    // A newer request, a new target, or unmounting supersedes this response.
    if (requestId !== requestIdRef.current) return;

    // A fallback means the request failed — no network, or the maps budget is
    // spent — not that the road changed. Swapping a live route for a straight
    // line mid-ride would point the rider through whatever lies between, so
    // the last good route stays until a real one replaces it. The fallback is
    // still accepted when there is nothing to keep, so a leg always draws.
    if (next.source === "fallback" && routeRef.current) {
      if (__DEV__) {
        console.warn("[live-leg] keeping last good route:", next.errorStatus);
      }
      setStatus("ready");
      return;
    }

    offRouteSinceRef.current = null;
    setRoute(next);
    setProgress(null);
    setStatus("ready");
  }, []);

  // A new target starts a new leg; no target (waiting at a stop, or finished) clears it.
  useEffect(() => {
    requestIdRef.current += 1;
    offRouteSinceRef.current = null;
    routeRef.current = null;
    setRoute(null);
    setProgress(null);

    if (!targetId || !hasFix) {
      setStatus("idle");
      return;
    }

    void fetchLeg("leg-start");
  }, [fetchLeg, hasFix, targetId]);

  // Match each fix to the leg.
  useEffect(() => {
    if (!fix || !geometry) return;

    setProgress((previous) =>
      advanceLegProgress(
        geometry,
        {
          coordinate: fix.coordinate,
          headingDegrees: fix.headingDegrees,
          speedMps: fix.speedMps,
        },
        previous,
      ),
    );
  }, [fix, geometry]);

  // Reroute once off-route for the grace period, and no more often than the cooldown.
  useEffect(() => {
    if (!progress || status === "loading" || status === "rerouting") return;

    if (progress.isOnRoute) {
      offRouteSinceRef.current = null;
      return;
    }

    const now = Date.now();
    if (offRouteSinceRef.current === null) {
      offRouteSinceRef.current = now;
    }

    const offRouteLongEnough = now - offRouteSinceRef.current >= DEFAULT_ROUTE_DEVIATION_GRACE_MS;
    const cooledDown = now - lastFetchAtRef.current >= DEFAULT_ROUTE_REROUTE_COOLDOWN_MS;

    if (offRouteLongEnough && cooledDown) {
      void fetchLeg("reroute");
    }
  }, [fetchLeg, progress, status]);

  // Refresh the ETA for traffic now and then while riding.
  useEffect(() => {
    if (!isActive || !targetId) return;

    const timer = setInterval(() => {
      // Both clocks must have elapsed: the local one, and the shared one that
      // stops a second mount of this hook billing the same refresh twice.
      const sharedAt =
        lastTrafficFetch.targetId === targetId ? lastTrafficFetch.at : 0;
      const elapsed = Date.now() - Math.max(lastFetchAtRef.current, sharedAt);

      if (elapsed >= trafficRefreshMs) {
        void fetchLeg("traffic");
      }
    }, TRAFFIC_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [fetchLeg, isActive, targetId, trafficRefreshMs]);

  // Ignore any response that lands after unmount.
  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  return {
    route,
    leg,
    geometry,
    progress,
    status,
    isOffRoute: progress ? !progress.isOnRoute : false,
  };
};
