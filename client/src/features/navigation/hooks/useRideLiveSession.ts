import { useEffect } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import { useAuthStore } from "../../../store/authStore";
import { useLiveSessionStore } from "../../../store/liveSessionStore";
import type { RideState } from "../core/guidance";
import type { RideRouteSource } from "../core/tripPlan";
import type { RideParticipantView } from "../types/navigation";

const HEARTBEAT_INTERVAL_MS = 10_000;
const JOINABLE_STATUSES: ReadonlySet<string> = new Set(["active", "starting", "paused"]);
const TRACKING_STATUSES: ReadonlySet<string> = new Set(["active", "starting"]);

export interface RideParticipantPayload {
  rider_id: string;
  display_name?: string | null;
  role: RideParticipantView["role"];
}

/**
 * The parts of the ride payload navigation reads. The same query cache entry
 * backs the ride detail screen, so the payload is typed here, not reshaped.
 */
export interface NavigationRide extends RideRouteSource {
  id: string;
  title: string;
  status: string;
  captain_id: string;
  participants?: RideParticipantPayload[];
}

type LiveSessionStore = ReturnType<typeof useLiveSessionStore.getState>;

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { response?: { status?: number } }).response?.status === 404;

const fetchRide = async (rideId: string): Promise<NavigationRide> => {
  const { data } = await apiClient.get(`/api/rides/${rideId}`);
  return data.ride as NavigationRide;
};

const fetchLiveSession = async (rideId: string): Promise<{ status?: string } | null> => {
  try {
    const { data } = await apiClient.get(`/api/rides/${rideId}/live/session`);
    return data.session ?? null;
  } catch (error: unknown) {
    // No live session yet is a normal state, not a failure.
    if (isNotFound(error)) return null;
    throw error;
  }
};

const startLiveSession = async (rideId: string): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/start`);
};

const endLiveSession = async (rideId: string): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/end`, {
    mark_ride_completed: true,
    reason: "ride_completed",
  });
};

interface UseRideLiveSessionInput {
  rideId: string | undefined;
  isAppActive: boolean;
  onRideEnded: () => void;
}

export interface RideLiveSession {
  ride: NavigationRide | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  rideState: RideState;
  /** The session is live and this rider's position should be tracked and shared. */
  isTracking: boolean;
  startRide: () => void;
  isStarting: boolean;
  endRide: () => void;
  isEnding: boolean;
  inRoom: boolean;
  presence: LiveSessionStore["presence"];
  locations: LiveSessionStore["locations"];
  sessionEndedReason: LiveSessionStore["sessionEndedReason"];
  upsertLocation: LiveSessionStore["upsertLocation"];
  reportWaypointReached: LiveSessionStore["reportWaypointReached"];
}

/** The ride, its live session, and this rider's connection to the session's room. */
export const useRideLiveSession = ({
  rideId,
  isAppActive,
  onRideEnded,
}: UseRideLiveSessionInput): RideLiveSession => {
  const queryClient = useQueryClient();
  const token = useAuthStore((state: any) => state.token) as string | null | undefined;
  const store = useLiveSessionStore();
  const {
    connect,
    setRideContext,
    clearRideContext,
    joinRoom,
    sendHeartbeat,
    connected,
    inRoom,
    isJoining,
    session: socketSession,
  } = store;

  const rideQuery = useQuery({
    queryKey: ["ride", rideId],
    queryFn: () => fetchRide(rideId!),
    enabled: Boolean(rideId),
  });

  const liveSessionQuery = useQuery({
    queryKey: ["live-session", rideId],
    queryFn: () => fetchLiveSession(rideId!),
    enabled: Boolean(rideId),
    retry: false,
  });

  const refreshRide = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ride", rideId] }),
      queryClient.invalidateQueries({ queryKey: ["live-session", rideId] }),
    ]);
    await liveSessionQuery.refetch();
  };

  const startMutation = useMutation({
    mutationFn: () => startLiveSession(rideId!),
    onSuccess: async () => {
      await refreshRide();
      joinRoom(rideId!);
    },
    onError: () => Alert.alert("Couldn't start the ride", "Check your connection and try again."),
  });

  const endMutation = useMutation({
    mutationFn: () => endLiveSession(rideId!),
    onSuccess: async () => {
      await refreshRide();
      onRideEnded();
    },
    onError: () => Alert.alert("Couldn't end the ride", "Check your connection and try again."),
  });

  useEffect(() => {
    if (!token || !rideId) return;

    connect(token);
    setRideContext(rideId);
    return () => clearRideContext();
  }, [clearRideContext, connect, rideId, setRideContext, token]);

  const liveStatus = socketSession?.status || liveSessionQuery.data?.status || "not_started";

  useEffect(() => {
    const shouldJoin =
      Boolean(rideId) &&
      connected &&
      isAppActive &&
      !inRoom &&
      !isJoining &&
      JOINABLE_STATUSES.has(liveStatus);

    if (shouldJoin) {
      joinRoom(rideId!);
    }
  }, [connected, inRoom, isAppActive, isJoining, joinRoom, liveStatus, rideId]);

  useEffect(() => {
    if (!inRoom || !isAppActive) return;

    const timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [inRoom, isAppActive, sendHeartbeat]);

  const ride = rideQuery.data ?? null;
  const rideState: RideState =
    ride?.status === "completed" || liveStatus === "ended"
      ? "COMPLETED"
      : TRACKING_STATUSES.has(liveStatus) || ride?.status === "active"
        ? "ACTIVE"
        : "NOT_STARTED";

  return {
    ride,
    isLoading: rideQuery.isLoading,
    isError: rideQuery.isError,
    refetch: () => void rideQuery.refetch(),
    rideState,
    isTracking: TRACKING_STATUSES.has(liveStatus),
    startRide: () => startMutation.mutate(),
    isStarting: startMutation.isPending,
    endRide: () => endMutation.mutate(),
    isEnding: endMutation.isPending,
    inRoom,
    presence: store.presence,
    locations: store.locations,
    sessionEndedReason: store.sessionEndedReason,
    upsertLocation: store.upsertLocation,
    reportWaypointReached: store.reportWaypointReached,
  };
};
