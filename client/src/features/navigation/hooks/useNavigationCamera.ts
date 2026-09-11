import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useWindowDimensions } from "react-native";
import type MapView from "react-native-maps";
import type { Details, EdgePadding, Region } from "react-native-maps";
import { FOLLOW_PITCH_DEGREES, followZoomForSpeed } from "../core/cameraPolicy";
import { angleDeltaDegrees, haversineMeters } from "../core/geometry";
import type { LatLng, NavigationFix } from "../types/navigation";

/**
 * - follow: heading-up behind the rider, zoom from speed.
 * - free: the rider panned or zoomed; the camera leaves them alone until re-centred.
 * - overview: the rest of the route, north-up.
 */
export type CameraMode = "follow" | "free" | "overview";

const MIN_FOLLOW_MOVE_METERS = 5;
const MIN_FOLLOW_TURN_DEGREES = 8;
const MIN_FOLLOW_INTERVAL_MS = 900;
const FOLLOW_ANIMATION_MS = 900;
const FOCUS_ANIMATION_MS = 650;
const FOCUS_ZOOM = 16;
const FOCUS_PITCH_DEGREES = 42;
const OVERVIEW_EDGE_PADDING = 48;
/**
 * Extra top padding in follow mode, as a share of the visible map. It moves
 * the rider down the screen so more road ahead is in view, as in Google Maps.
 */
const FOLLOW_LOOK_AHEAD_SHARE = 0.35;

interface UseNavigationCameraInput {
  mapRef: RefObject<MapView | null>;
  fix: NavigationFix | null;
  headingDegrees: number | null;
  /** Height covered at the top of the screen by the maneuver banner. */
  topInset: number;
  /** Height covered at the bottom by the collapsed trip bar. */
  bottomInset: number;
}

export interface NavigationCamera {
  mode: CameraMode;
  mapPadding: EdgePadding;
  follow: () => void;
  showOverview: (coordinates: LatLng[]) => void;
  focusOn: (center: LatLng, headingDegrees: number) => void;
  onRegionChange: (region: Region, details: Details) => void;
  onPanDrag: () => void;
}

interface FollowFrame {
  at: number;
  center: LatLng;
  heading: number;
}

export const useNavigationCamera = ({
  mapRef,
  fix,
  headingDegrees,
  topInset,
  bottomInset,
}: UseNavigationCameraInput): NavigationCamera => {
  const { height: windowHeight } = useWindowDimensions();
  const [mode, setMode] = useState<CameraMode>("follow");
  const [overviewRequest, setOverviewRequest] = useState(0);

  const lastFollowRef = useRef<FollowFrame | null>(null);
  const zoomRef = useRef<number | undefined>(undefined);
  const overviewCoordinatesRef = useRef<LatLng[]>([]);

  // Camera moves are relative to the padded area, so padding places the rider on screen.
  const mapPadding = useMemo((): EdgePadding => {
    const visibleHeight = Math.max(0, windowHeight - topInset - bottomInset);
    const lookAhead = mode === "follow" ? Math.round(visibleHeight * FOLLOW_LOOK_AHEAD_SHARE) : 0;
    return { top: topInset + lookAhead, right: 0, bottom: bottomInset, left: 0 };
  }, [bottomInset, mode, topInset, windowHeight]);

  // Follow the rider. Also runs right after re-centring, once the follow padding is in place.
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "follow" || !fix || !map) return;

    const last = lastFollowRef.current;
    const heading = headingDegrees ?? last?.heading ?? 0;

    if (last) {
      const isTooSoon = Date.now() - last.at < MIN_FOLLOW_INTERVAL_MS;
      const hasMoved = haversineMeters(last.center, fix.coordinate) >= MIN_FOLLOW_MOVE_METERS;
      const hasTurned = angleDeltaDegrees(last.heading, heading) >= MIN_FOLLOW_TURN_DEGREES;
      if (isTooSoon || (!hasMoved && !hasTurned)) return;
    }

    const zoom = followZoomForSpeed(fix.speedMps, zoomRef.current);
    zoomRef.current = zoom;

    map.animateCamera(
      { center: fix.coordinate, heading, pitch: FOLLOW_PITCH_DEGREES, zoom },
      { duration: FOLLOW_ANIMATION_MS },
    );
    lastFollowRef.current = { at: Date.now(), center: fix.coordinate, heading };
  }, [fix, headingDegrees, mapRef, mode, mapPadding]);

  // Frame the overview after its (unshifted) padding has applied.
  useEffect(() => {
    const map = mapRef.current;
    const coordinates = overviewCoordinatesRef.current;
    if (overviewRequest === 0 || !map || coordinates.length === 0) return;

    // Overview is north-up and flat; fitting keeps whatever heading the map had.
    map.setCamera({ heading: 0, pitch: 0 });
    map.fitToCoordinates(coordinates, {
      edgePadding: {
        top: OVERVIEW_EDGE_PADDING,
        right: OVERVIEW_EDGE_PADDING,
        bottom: OVERVIEW_EDGE_PADDING,
        left: OVERVIEW_EDGE_PADDING,
      },
      animated: true,
    });
  }, [mapRef, overviewRequest]);

  const follow = useCallback(() => {
    lastFollowRef.current = null;
    setMode("follow");
  }, []);

  const showOverview = useCallback((coordinates: LatLng[]) => {
    overviewCoordinatesRef.current = coordinates;
    setMode("overview");
    setOverviewRequest((request) => request + 1);
  }, []);

  const focusOn = useCallback(
    (center: LatLng, heading: number) => {
      setMode("free");
      mapRef.current?.animateCamera(
        { center, heading, pitch: FOCUS_PITCH_DEGREES, zoom: FOCUS_ZOOM },
        { duration: FOCUS_ANIMATION_MS },
      );
    },
    [mapRef],
  );

  // The camera's own animations report isGesture: false, so following never kicks itself out.
  const onRegionChange = useCallback((_region: Region, details: Details) => {
    if (details?.isGesture) setMode("free");
  }, []);

  const onPanDrag = useCallback(() => setMode("free"), []);

  return { mode, mapPadding, follow, showOverview, focusOn, onRegionChange, onPanDrag };
};
