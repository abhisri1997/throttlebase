import * as ExpoLocation from "expo-location";
import { Platform } from "react-native";
import { apiClient } from "../../../api/client";
import { GROUP_ALERT_KIND } from "../core/groupAlert";

export interface AlertCoords {
  lon: number;
  lat: number;
}

/**
 * Where the rider is, for the alert. Asked only when they press send, never
 * on mount (mount-time prompts crash Android ride screens). A rider who says
 * no still sends the alert, just without a position.
 */
export const currentAlertCoords = async (): Promise<AlertCoords | undefined> => {
  if (Platform.OS === "web") return undefined;

  try {
    const permission = await ExpoLocation.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return undefined;

    const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
    if (lastKnown?.coords) {
      return { lon: lastKnown.coords.longitude, lat: lastKnown.coords.latitude };
    }

    const current = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.Balanced,
    });
    return { lon: current.coords.longitude, lat: current.coords.latitude };
  } catch {
    return undefined;
  }
};

/** The HTTP route, for a rider not in the live room. The server tells the room. */
export const postGroupAlert = async (rideId: string, coords?: AlertCoords): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/incident`, {
    severity: "critical",
    kind: GROUP_ALERT_KIND,
    ...(coords ?? {}),
    metadata: { source: "mobile" },
  });
};
