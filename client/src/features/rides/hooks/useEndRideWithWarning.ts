import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "../../../utils/apiError";
import { endGroupRide, getUnfinishedRiders, type UnfinishedRiderPayload } from "../api/rideProgress";
import { describeUnfinishedRider } from "../core/riderProgress";

interface UseEndRideWithWarningInput {
  rideId: string | undefined;
  onEnded?: () => void;
}

const warnAboutRidersStillOut = (
  riders: UnfinishedRiderPayload[],
  onEndAnyway: () => void,
): void => {
  const lines = riders.map((rider) =>
    describeUnfinishedRider(
      {
        displayName: rider.display_name || "A rider",
        isOnline: rider.is_online,
        lastHeartbeatAt: rider.last_heartbeat_at,
        distanceToDestinationMeters: rider.distance_to_destination_m,
      },
      Date.now(),
    ),
  );
  const title =
    riders.length === 1 ? "1 rider hasn't arrived" : `${riders.length} riders haven't arrived`;

  Alert.alert(
    title,
    `${lines.join("\n")}\n\nEnd the ride anyway? They'll be marked as ended by the captain.`,
    [
      { text: "Keep riding", style: "cancel" },
      { text: "End anyway", style: "destructive", onPress: onEndAnyway },
    ],
  );
};

/**
 * Ends the group ride. If riders are still out, the captain is shown who and
 * how far away they are before choosing to end it anyway.
 */
export const useEndRideWithWarning = ({ rideId, onEnded }: UseEndRideWithWarningInput) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (confirmUnfinished: boolean) => endGroupRide(rideId!, { confirmUnfinished }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ride", rideId] }),
        queryClient.invalidateQueries({ queryKey: ["live-session", rideId] }),
        queryClient.invalidateQueries({ queryKey: ["rides"] }),
      ]);
      onEnded?.();
    },
    onError: (error: unknown) => {
      const ridersStillOut = getUnfinishedRiders(error);
      if (ridersStillOut) {
        warnAboutRidersStillOut(ridersStillOut, () => mutation.mutate(true));
        return;
      }
      Alert.alert(
        "Couldn't end the ride",
        getApiErrorMessage(error, "Check your connection and try again."),
      );
    },
  });

  return {
    endRide: () => mutation.mutate(false),
    isEnding: mutation.isPending,
  };
};
