import { useEffect } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import { useAccessToken } from "../../../services/useAuthState";
import { useLiveSessionStore } from "../../../store/liveSessionStore";
import type {
  LiveSessionParticipant,
  LiveSessionStateEvent,
} from "../../../services/liveSessionSocket";
import { isFinishedProgress } from "../../rides/core/riderProgress";
import { useEndRideWithWarning } from "../../rides/hooks/useEndRideWithWarning";
import type { RideState } from "../core/guidance";
import type { RideRouteSource } from "../core/tripPlan";
import type { RideParticipantView } from "../types/navigation";

const HEARTBEAT_INTERVAL_MS = 10_000;
/**
 * The worker finishes riders and ends idle rides without a socket to say so;
 * the roster catches up at this pace while the ride is live.
 */
const ROSTER_REFRESH_INTERVAL_MS = 15_000;
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

const fetchLiveSession = async (rideId: string): Promise<LiveSessionStateEvent | null> => {
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

const rollOutLiveSession = async (rideId: string): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/roll-out`);
};

interface UseRideLiveSessionInput {
  rideId: string | undefined;
  currentRiderId: string | undefined;
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
  /** Sets the group off once the captain has seen the roll call. */
  rollOut: () => void;
  isRollingOut: boolean;
  /** Raw live session status: "starting" is the roll call, before the ride rolls. */
  liveStatus: string;
  endRide: () => void;
  isEnding: boolean;
  inRoom: boolean;
  presence: LiveSessionStore["presence"];
  locations: LiveSessionStore["locations"];
  sessionEndedReason: LiveSessionStore["sessionEndedReason"];
  /** A rider left behind asking the group to wait; null once a leader answers. */
  regroupRequest: LiveSessionStore["regroupRequest"];
  /** The leaders' answer to a regroup, for the rider who asked for it. */
  regroupDecision: LiveSessionStore["regroupDecision"];
  upsertLocation: LiveSessionStore["upsertLocation"];
  reportWaypointReached: LiveSessionStore["reportWaypointReached"];
  /** Everyone in the live session, with each rider's own progress. */
  sessionParticipants: LiveSessionParticipant[];
  /** This rider's entry in the live session, once it exists. */
  me: LiveSessionParticipant | null;
  /** This rider reached the destination — prompt them to finish. */
  arrival: LiveSessionStore["arrival"];
  dismissArrival: LiveSessionStore["dismissArrival"];
}

/** The ride, its live session, and this rider's connection to the session's room. */
export const useRideLiveSession = ({
  rideId,
  currentRiderId,
  isAppActive,
  onRideEnded,
}: UseRideLiveSessionInput): RideLiveSession => {
  const queryClient = useQueryClient();
  const token = useAccessToken();
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
    refetchInterval: (query) =>
      isAppActive && query.state.data && JOINABLE_STATUSES.has(query.state.data.status)
        ? ROSTER_REFRESH_INTERVAL_MS
        : false,
  });

  // Someone started, finished or resumed: refresh everyone's progress now.
  const { progressVersion } = store;
  const refetchLiveSession = liveSessionQuery.refetch;
  useEffect(() => {
    if (progressVersion > 0) void refetchLiveSession();
  }, [progressVersion, refetchLiveSession]);

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

  const rollOutMutation = useMutation({
    mutationFn: () => rollOutLiveSession(rideId!),
    onSuccess: refreshRide,
    onError: () => Alert.alert("Couldn't set off", "Check your connection and try again."),
  });

  const { endRide, isEnding } = useEndRideWithWarning({ rideId, onEnded: onRideEnded });

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

  // The session over the socket only arrives on joining; the query carries
  // the progress that changes after that.
  const sessionParticipants =
    liveSessionQuery.data?.participants ?? socketSession?.participants ?? [];
  const me = sessionParticipants.find((participant) => participant.rider_id === currentRiderId) ?? null;
  const isMeRiding = me?.progress === "riding";
  const isMeFinished = me?.progress ? isFinishedProgress(me.progress) : false;

  // "starting" is the roll call: riders are joining and reporting where they
  // are, but the group has not set off — unless this rider started their own
  // ride early, in which case it is under way for them.
  const rideState: RideState =
    ride?.status === "completed" || liveStatus === "ended"
      ? "COMPLETED"
      : liveStatus === "active" || ride?.status === "active" || isMeRiding
        ? "ACTIVE"
        : "NOT_STARTED";

  return {
    ride,
    isLoading: rideQuery.isLoading,
    isError: rideQuery.isError,
    refetch: () => void rideQuery.refetch(),
    rideState,
    // A finished rider follows the group without sharing where they are.
    isTracking: TRACKING_STATUSES.has(liveStatus) && !isMeFinished,
    startRide: () => startMutation.mutate(),
    isStarting: startMutation.isPending,
    rollOut: () => rollOutMutation.mutate(),
    isRollingOut: rollOutMutation.isPending,
    liveStatus,
    endRide,
    isEnding,
    inRoom,
    presence: store.presence,
    locations: store.locations,
    sessionEndedReason: store.sessionEndedReason,
    regroupRequest: store.regroupRequest,
    regroupDecision: store.regroupDecision,
    upsertLocation: store.upsertLocation,
    reportWaypointReached: store.reportWaypointReached,
    sessionParticipants,
    me,
    arrival: store.arrival,
    dismissArrival: store.dismissArrival,
  };
};
