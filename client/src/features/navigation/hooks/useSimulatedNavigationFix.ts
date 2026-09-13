import { useEffect, useMemo, useRef, useState } from "react";
import { buildSimulatedFixes } from "../core/gpsSimulator";
import type { LatLng, NavigationFix } from "../types/navigation";

const PLAYBACK_INTERVAL_MS = 1000;

interface UseSimulatedNavigationFixInput {
  isEnabled: boolean;
  /** The route to replay — the planned route's polyline, once fetched. */
  polyline: readonly LatLng[] | null;
  speedMps?: number;
  onPosition?: (fix: NavigationFix) => void;
}

export interface SimulatedNavigationFixState {
  fix: NavigationFix | null;
  headingDegrees: number | null;
  isPermissionDenied: boolean;
}

/**
 * Replays a synthetic ride along `polyline` in place of real GPS, so leg
 * transitions, camera behaviour and guidance can be watched on a stationary
 * device. Mirrors `useNavigationFix`'s shape so the two are interchangeable
 * at the call site. Dev tooling only — never enabled in a production build.
 */
export const useSimulatedNavigationFix = ({
  isEnabled,
  polyline,
  speedMps,
  onPosition,
}: UseSimulatedNavigationFixInput): SimulatedNavigationFixState => {
  const [fix, setFix] = useState<NavigationFix | null>(null);
  const indexRef = useRef(0);

  // Read through a ref so a changed callback identity doesn't restart playback.
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const trace = useMemo(
    () =>
      isEnabled && polyline && polyline.length >= 2
        ? buildSimulatedFixes(polyline, { speedMps, sampleIntervalMs: PLAYBACK_INTERVAL_MS })
        : [],
    [isEnabled, polyline, speedMps],
  );

  useEffect(() => {
    // The last fix is kept: a rebuilt trace restarts the ride, but blanking the
    // position first would take the rider off the map for a frame.
    indexRef.current = 0;
    if (!isEnabled || trace.length === 0) return;

    const tick = (): void => {
      const next = trace[indexRef.current];
      if (!next) return;
      setFix(next);
      onPositionRef.current?.(next);
      indexRef.current = Math.min(indexRef.current + 1, trace.length - 1);
    };

    tick();
    const interval = setInterval(tick, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isEnabled, trace]);

  return { fix, headingDegrees: fix?.headingDegrees ?? null, isPermissionDenied: false };
};
