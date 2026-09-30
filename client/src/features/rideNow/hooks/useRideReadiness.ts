import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as ExpoLocation from "expo-location";
import { permits } from "../../consent/core/consent";
import { useConsents } from "../../consent/hooks/useConsents";
import { useNavigationFix } from "../../navigation/hooks/useNavigationFix";
import type { NavigationFix } from "../../navigation/types/navigation";

/** Below this the fix is good enough to ride on (docs/ride-now-ux.md §4.2). */
const GOOD_GPS_ACCURACY_M = 30;

export type LocationAccess = "checking" | "granted" | "denied";
export type GpsQuality = "searching" | "good" | "weak";

export interface RideReadiness {
  location: LocationAccess;
  /** Asks for location: only when the rider taps, never on opening the screen. */
  requestLocation: () => void;
  gps: GpsQuality;
  fix: NavigationFix | null;
  /** False when the rider switched recording off: the ride won't be saved. */
  isRecording: boolean;
}

const gpsQuality = (fix: NavigationFix | null): GpsQuality => {
  if (!fix) return "searching";
  const accuracy = fix.accuracyMeters;
  return accuracy !== null && accuracy < GOOD_GPS_ACCURACY_M ? "good" : "weak";
};

/**
 * What the Ride now screen checks before setting off. Passive: opening the
 * screen only reads the permission (the Android crash postmortem), and asking
 * waits for a tap.
 */
export const useRideReadiness = (): RideReadiness => {
  const [location, setLocation] = useState<LocationAccess>("checking");
  const overview = useConsents().data;

  useEffect(() => {
    if (Platform.OS === "web") return;

    let isClosed = false;
    ExpoLocation.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (!isClosed) setLocation(status === "granted" ? "granted" : "denied");
      })
      .catch(() => {
        if (!isClosed) setLocation("denied");
      });
    return () => {
      isClosed = true;
    };
  }, []);

  const requestLocation = useCallback(() => {
    ExpoLocation.requestForegroundPermissionsAsync()
      .then(({ status }) => setLocation(status === "granted" ? "granted" : "denied"))
      .catch(() => setLocation("denied"));
  }, []);

  const { fix } = useNavigationFix({ isEnabled: location === "granted" });

  return {
    location,
    requestLocation,
    gps: gpsQuality(fix),
    fix,
    isRecording: overview ? permits(overview, "ride_recording") : true,
  };
};
