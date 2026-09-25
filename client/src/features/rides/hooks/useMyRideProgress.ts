import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getActiveTrackingRideId,
  stopTracking,
} from "../../../services/backgroundLocationService";
import type { LiveSessionParticipant } from "../../../services/liveSessionSocket";
import { getApiErrorMessage } from "../../../utils/apiError";
import { formatDistance } from "../../navigation/core/format";
import { finishMyRide, resumeMyRide, startMyRide } from "../api/rideProgress";
import {
  isFinishedProgress,
  previewFinishReason,
  type RiderProgress,
} from "../core/riderProgress";

interface UseMyRideProgressInput {
  rideId: string | undefined;
  /** This rider's entry in the live session, if the session exists. */
  me: LiveSessionParticipant | null;
  /** A fresher distance than the session's, e.g. from the navigation fix. */
  liveDistanceToDestinationMeters?: number | null;
  onStarted?: () => void;
}

export interface MyRideProgress {
  progress: RiderProgress;
  isRiding: boolean;
  isFinished: boolean;
  startMyRide: () => void;
  isStartingMyRide: boolean;
  /** Asks first, saying whether it will count as arrived or leaving early. */
  confirmFinishMyRide: () => void;
  finishMyRideNow: () => void;
  isFinishingMyRide: boolean;
  resumeMyRide: () => void;
  isResumingMyRide: boolean;
}

/** This rider's own ride within the group ride: start early, finish, take it back. */
export const useMyRideProgress = ({
  rideId,
  me,
  liveDistanceToDestinationMeters,
  onStarted,
}: UseMyRideProgressInput): MyRideProgress => {
  const queryClient = useQueryClient();
  const progress: RiderProgress = me?.progress ?? "not_started";

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["live-session", rideId] }),
      queryClient.invalidateQueries({ queryKey: ["ride", rideId] }),
      queryClient.invalidateQueries({ queryKey: ["my-active-rides-bg"] }),
      queryClient.invalidateQueries({ queryKey: ["rides"] }),
    ]);
  };

  const startMutation = useMutation({
    mutationFn: () => startMyRide(rideId!),
    onSuccess: async () => {
      await refresh();
      onStarted?.();
    },
    onError: (error: unknown) =>
      Alert.alert("Couldn't start your ride", getApiErrorMessage(error, "Try again in a moment.")),
  });

  const finishMutation = useMutation({
    mutationFn: () => finishMyRide(rideId!),
    onSuccess: async (result) => {
      // Stop reporting where this rider is straight away, not at the next poll.
      if (rideId && getActiveTrackingRideId() === rideId) {
        await stopTracking();
      }
      await refresh();

      if (result.ride_completed) {
        Alert.alert("Ride complete", "Everyone has finished — the ride is complete.");
      }
    },
    onError: (error: unknown) =>
      Alert.alert("Couldn't finish your ride", getApiErrorMessage(error, "Try again in a moment.")),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeMyRide(rideId!),
    onSuccess: refresh,
    onError: (error: unknown) =>
      Alert.alert("Couldn't resume your ride", getApiErrorMessage(error, "Try again in a moment.")),
  });

  const confirmFinishMyRide = (): void => {
    const distance = liveDistanceToDestinationMeters ?? me?.distance_to_destination_m ?? null;
    const reason = previewFinishReason({
      distanceToDestinationMeters: distance,
      hasArrived: Boolean(me?.arrived_at),
    });
    const body =
      reason === "arrived"
        ? "You'll be marked as arrived. You can keep following the group."
        : `You're ${formatDistance(distance ?? 0)} from the destination, so the group will see that you left early. You can keep following them.`;

    Alert.alert("Finish your ride?", body, [
      { text: "Not yet", style: "cancel" },
      {
        text: "Finish",
        style: reason === "arrived" ? "default" : "destructive",
        onPress: () => finishMutation.mutate(),
      },
    ]);
  };

  return {
    progress,
    isRiding: progress === "riding",
    isFinished: isFinishedProgress(progress),
    startMyRide: () => startMutation.mutate(),
    isStartingMyRide: startMutation.isPending,
    confirmFinishMyRide,
    finishMyRideNow: () => finishMutation.mutate(),
    isFinishingMyRide: finishMutation.isPending,
    resumeMyRide: () => resumeMutation.mutate(),
    isResumingMyRide: resumeMutation.isPending,
  };
};
