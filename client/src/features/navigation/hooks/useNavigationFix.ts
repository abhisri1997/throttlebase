import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as ExpoLocation from "expo-location";
import { chooseHeading } from "../core/cameraPolicy";
import { angleDeltaDegrees, haversineMeters } from "../core/geometry";
import type { NavigationFix } from "../types/navigation";

/** Smaller moves are GPS jitter; ignoring them spares a re-render of the whole map. */
const MIN_FIX_MOVE_METERS = 4;
const MIN_COMPASS_CHANGE_DEGREES = 4;
const WATCH_INTERVAL_MS = 4000;
const WATCH_DISTANCE_METERS = 8;

const warnInDev = (message: string, error: unknown): void => {
  if (__DEV__) {
    console.warn(message, error);
  }
};

const finiteOrNull = (value: number | null | undefined, minimum = Number.NEGATIVE_INFINITY) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;

const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const toNavigationFix = (position: ExpoLocation.LocationObject): NavigationFix => ({
  coordinate: {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  },
  accuracyMeters: finiteOrNull(position.coords.accuracy),
  // Expo reports a negative value (or null) when the course or speed is unknown.
  headingDegrees: finiteOrNull(position.coords.heading, 0),
  speedMps: finiteOrNull(position.coords.speed, 0),
  timestamp: position.timestamp,
});

interface UseNavigationFixInput {
  isEnabled: boolean;
  /** Called with every reading, including those too small to move the map. */
  onPosition?: (fix: NavigationFix) => void;
}

export interface NavigationFixState {
  fix: NavigationFix | null;
  /** Direction the rider faces, in degrees from north; null until known. */
  headingDegrees: number | null;
  isPermissionDenied: boolean;
}

/** The rider's GPS position and compass heading while navigation is tracking. */
export const useNavigationFix = ({
  isEnabled,
  onPosition,
}: UseNavigationFixInput): NavigationFixState => {
  const [fix, setFix] = useState<NavigationFix | null>(null);
  const [compassDegrees, setCompassDegrees] = useState<number | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  // Read through a ref so joining the room doesn't restart the GPS subscription.
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  useEffect(() => {
    if (!isEnabled || Platform.OS === "web") return;

    let isClosed = false;
    const subscriptions: ExpoLocation.LocationSubscription[] = [];
    // A subscription that resolves after cleanup is removed straight away.
    const keep = (subscription: ExpoLocation.LocationSubscription): void => {
      if (isClosed) subscription.remove();
      else subscriptions.push(subscription);
    };

    const applyPosition = (position: ExpoLocation.LocationObject): void => {
      const next = toNavigationFix(position);
      setFix((previous) =>
        previous && haversineMeters(previous.coordinate, next.coordinate) < MIN_FIX_MOVE_METERS
          ? previous
          : next,
      );
      onPositionRef.current?.(next);
    };

    const applyCompass = (heading: ExpoLocation.LocationHeadingObject): void => {
      const raw = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
      if (!Number.isFinite(raw) || raw < 0) return;

      const next = normalizeDegrees(raw);
      setCompassDegrees((previous) =>
        previous !== null && angleDeltaDegrees(previous, next) < MIN_COMPASS_CHANGE_DEGREES
          ? previous
          : next,
      );
    };

    const start = async (): Promise<void> => {
      const permission = await ExpoLocation.getForegroundPermissionsAsync();
      if (isClosed) return;

      const isGranted = permission.status === "granted";
      setIsPermissionDenied(!isGranted);
      if (!isGranted) return;

      // A last-known position puts the rider on the map before the first live fix.
      try {
        const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
        if (!isClosed && lastKnown) applyPosition(lastKnown);
      } catch (error: unknown) {
        warnInDev("[navigation] no last known position", error);
      }

      try {
        keep(await ExpoLocation.watchHeadingAsync(applyCompass));
      } catch (error: unknown) {
        warnInDev("[navigation] compass unavailable; using GPS course only", error);
      }

      try {
        keep(
          await ExpoLocation.watchPositionAsync(
            {
              accuracy: ExpoLocation.Accuracy.BestForNavigation,
              timeInterval: WATCH_INTERVAL_MS,
              distanceInterval: WATCH_DISTANCE_METERS,
            },
            applyPosition,
          ),
        );
      } catch (error: unknown) {
        warnInDev("[navigation] could not watch position", error);
      }
    };

    void start();

    return () => {
      isClosed = true;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [isEnabled]);

  const headingDegrees = useMemo(() => chooseHeading(fix, compassDegrees), [compassDegrees, fix]);

  return { fix, headingDegrees, isPermissionDenied };
};
