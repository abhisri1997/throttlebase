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

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
/** Traffic changes slowly; refreshing the ETA more often than this only bills more. */
export const LIVE_LEG_TRAFFIC_REFRESH_MS = 5 * 60 * 1000;
const TRAFFIC_CHECK_INTERVAL_MS = 30 * 1000;

export type LiveLegStatus = "idle" | "loading" | "rerouting" | "ready";
type FetchReason = "leg-start" | "reroute" | "traffic";

interface UseLiveLegInput {
  /** Waypoint being ridden to; null while waiting at a stop or once finished. */
  target: TripWaypoint | null;
  fix: NavigationFix | null;
  /** App in the foreground. The traffic refresh pauses in the background. */
  isActive: boolean;
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
export const useLiveLeg = ({ target, fix, isActive }: UseLiveLegInput): LiveLegState => {
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [progress, setProgress] = useState<LegProgress | null>(null);
  const [status, setStatus] = useState<LiveLegStatus>("idle");

  const requestIdRef = useRef(0);
  const lastFetchAtRef = useRef(0);
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

    // A traffic refresh swaps the route quietly; only real changes show a status.
    if (reason !== "traffic") {
      setStatus(reason === "reroute" ? "rerouting" : "loading");
    }

    const next = await fetchLiveLeg(
      currentFix.coordinate,
      currentTarget.coordinate,
      GOOGLE_MAPS_API_KEY,
    );

    // A newer request, a new target, or unmounting supersedes this response.
    if (requestId !== requestIdRef.current) return;

    offRouteSinceRef.current = null;
    setRoute(next);
    setProgress(null);
    setStatus("ready");
  }, []);

  // A new target starts a new leg; no target (waiting at a stop, or finished) clears it.
  useEffect(() => {
    requestIdRef.current += 1;
    offRouteSinceRef.current = null;
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
      if (Date.now() - lastFetchAtRef.current >= LIVE_LEG_TRAFFIC_REFRESH_MS) {
        void fetchLeg("traffic");
      }
    }, TRAFFIC_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [fetchLeg, isActive, targetId]);

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
