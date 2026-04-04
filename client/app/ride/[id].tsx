import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  AppState,
  type AppStateStatus,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { useAuthStore } from "../../src/store/authStore";
import { useLiveSessionStore } from "../../src/store/liveSessionStore";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "../../src/components/MapWrapper";
import {
  Calendar,
  Users,
  Gauge,
  ChevronLeft,
  Navigation,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Edit3,
  Trash2,
  Star,
} from "lucide-react-native";
import { showLocation } from "react-native-map-link";
import * as ExpoLocation from "expo-location";
import { useTheme } from "../../src/theme/ThemeContext";
import LocationPicker from "../../src/components/LocationPicker";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { rideSocket } from "../../src/services/rideSocket";
import {
  buildCanonicalRideRouteInput,
  fetchNavigationRoute,
  haversineMeters,
} from "../../src/features/navigation/services/navigationRouteService";
import type { LatLng } from "../../src/features/navigation/types/navigation";

const fetchRideDetails = async (id: string) => {
  const { data } = await apiClient.get(`/api/rides/${id}`);
  return data.ride;
};

const joinRide = async (id: string, coords?: [number, number]) => {
  const { data } = await apiClient.post(`/api/rides/${id}/join`, {
    location_coords: coords,
  });
  return data;
};

const updateStartLocationOverride = async (
  id: string,
  coords: [number, number],
) => {
  const { data } = await apiClient.patch(`/api/rides/${id}/start-location`, {
    location_coords: coords,
  });
  return data;
};

const promoteRider = async (rideId: string, riderId: string) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/promote`, {
    rider_id: riderId,
  });
  return data;
};

const handleStop = async (rideId: string, stopId: string, status: string) => {
  const { data } = await apiClient.patch(
    `/api/rides/${rideId}/stops/${stopId}`,
    { status },
  );
  return data;
};

const updateRideStatus = async (rideId: string, status: string) => {
  const { data } = await apiClient.patch(`/api/rides/${rideId}`, { status });
  return data;
};

const deleteRideReq = async (id: string) => {
  const { data } = await apiClient.delete(`/api/rides/${id}`);
  return data;
};

type RideReview = {
  id: string;
  rider_id: string;
  reviewer_name: string;
  rating: number;
  review_text?: string | null;
  created_at: string;
};

const fetchRideReviews = async (rideId: string): Promise<RideReview[]> => {
  const { data } = await apiClient.get(
    `/api/community/rides/${rideId}/reviews`,
  );
  return data;
};

const submitRideReview = async (
  rideId: string,
  payload: { rating: number; review_text?: string },
) => {
  const { data } = await apiClient.post(
    `/api/community/rides/${rideId}/reviews`,
    payload,
  );
  return data;
};

const fetchLiveSession = async (rideId: string) => {
  try {
    const { data } = await apiClient.get(`/api/rides/${rideId}/live/session`);
    return data.session ?? null;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }

    throw error;
  }
};

const startLiveSessionReq = async (rideId: string) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/live/start`);
  return data;
};

const endLiveSessionReq = async (
  rideId: string,
  options?: { markRideCompleted?: boolean; reason?: string },
) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/live/end`, {
    mark_ride_completed: Boolean(options?.markRideCompleted),
    ...(options?.reason ? { reason: options.reason } : {}),
  });
  return data;
};

const reportSOSReq = async (
  rideId: string,
  payload?: { lon: number; lat: number },
) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/live/incident`, {
    severity: "critical",
    kind: "sos",
    ...(payload ? payload : {}),
    metadata: {
      source: "mobile",
    },
  });
  return data;
};

const getSOSCoords = async (): Promise<
  { lon: number; lat: number } | undefined
> => {
  if (Platform.OS === "web") {
    return undefined;
  }

  try {
    const permission = await ExpoLocation.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      return undefined;
    }

    const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
    if (lastKnown?.coords) {
      return {
        lon: lastKnown.coords.longitude,
        lat: lastKnown.coords.latitude,
      };
    }

    const current = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.Balanced,
    });

    return {
      lon: current.coords.longitude,
      lat: current.coords.latitude,
    };
  } catch {
    return undefined;
  }
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#64748b",
  scheduled: "#3b82f6",
  active: "#22c55e",
  completed: "#a855f7",
  cancelled: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const toCoordinate = (raw?: [number, number] | null): LatLng | null => {
  if (!raw || raw.length < 2) {
    return null;
  }

  return {
    latitude: raw[1],
    longitude: raw[0],
  };
};

const NEXT_STATUS: Record<string, { label: string; status: string } | null> = {
  draft: { label: "Publish", status: "scheduled" },
  scheduled: { label: "Start Ride", status: "active" },
  active: { label: "Complete Ride", status: "completed" },
  completed: null,
  cancelled: null,
};

const getSessionEndedMessage = (reason?: string | null): string => {
  if (!reason) {
    return "The live session has ended.";
  }

  const normalized = reason.toLowerCase();
  if (normalized === "ride_completed" || normalized === "completed") {
    return "The live session ended because this ride was completed.";
  }
  if (
    normalized === "leader_ended" ||
    normalized === "captain_ended" ||
    normalized === "manual_stop"
  ) {
    return "The live session was ended by the ride leader.";
  }

  const readableReason = reason.replace(/_/g, " ");
  return `The live session has ended (${readableReason}).`;
};

export default function RideDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRider = useAuthStore((state: any) => state.rider);
  const token = useAuthStore((state: any) => state.token);
  const liveEnabled = process.env.EXPO_PUBLIC_ENABLE_LIVE_SESSION !== "false";
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const {
    connected: liveConnected,
    isJoining,
    inRoom,
    session: liveSocketSession,
    presence,
    locations,
    incidents,
    lastError: liveError,
    sessionEndedReason,
    connect,
    joinRoom,
    setRideContext,
    clearRideContext,
    sendHeartbeat,
    upsertLocation,
    reportSOS,
    reset,
  } = useLiveSessionStore();

  const {
    data: ride,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["ride", id],
    queryFn: () => fetchRideDetails(id!),
    enabled: !!id,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  const {
    data: reviews,
    isLoading: reviewsLoading,
    refetch: refetchReviews,
  } = useQuery({
    queryKey: ["ride-reviews", id],
    queryFn: () => fetchRideReviews(id!),
    enabled: !!id,
  });

  const isParticipantFromRide = Boolean(
    ride?.participants?.some((p: any) => p.rider_id === currentRider?.id),
  );

  const {
    data: liveSession,
    refetch: refetchLiveSession,
    isFetching: liveSessionLoading,
  } = useQuery({
    queryKey: ["live-session", id],
    queryFn: () => fetchLiveSession(id!),
    enabled: Boolean(
      liveEnabled &&
        id &&
        isParticipantFromRide &&
        ride?.status !== "cancelled",
    ),
    retry: false,
    refetchInterval: (query) => {
      if (
        appState !== "active" ||
        !liveEnabled ||
        !id ||
        !isParticipantFromRide ||
        ride?.status === "completed" ||
        ride?.status === "cancelled"
      ) {
        return false;
      }

      const session = query.state.data as
        | { id?: string; status?: string }
        | null
        | undefined;

      if (!session?.id || session.status === "ended") {
        return false;
      }

      return 5000;
    },
    refetchIntervalInBackground: false,
  });

  const effectiveLiveSession = liveSocketSession || liveSession;
  const liveStatus = effectiveLiveSession?.status || "not_started";
  const isTerminalRideStatus =
    ride?.status === "completed" || ride?.status === "cancelled";
  const canJoinLiveRoom =
    liveStatus === "active" ||
    liveStatus === "starting" ||
    liveStatus === "paused";
  const shouldEnableLiveSocket =
    liveEnabled &&
    Boolean(token) &&
    Boolean(id) &&
    isParticipantFromRide &&
    !isTerminalRideStatus &&
    canJoinLiveRoom;

  const [showJoinOverridePicker, setShowJoinOverridePicker] = useState(false);
  const [reviewRating, setReviewRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState("");
  const [sosSubmitting, setSOSSubmitting] = useState(false);
  const [sampledLocation, setSampledLocation] = useState<LatLng | null>(null);
  const [routePathCoordinates, setRoutePathCoordinates] = useState<LatLng[]>([]);
  const mapRef = useRef<InstanceType<typeof MapView>>(null);
  const lastRouteRefreshAtRef = useRef(0);
  const lastRouteOriginRef = useRef<LatLng | null>(null);

  const joinMutation = useMutation({
    mutationFn: (coords?: [number, number]) => joinRide(id!, coords),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
      queryClient.invalidateQueries({ queryKey: ["rides"] });
      Alert.alert("Success", "You have joined the ride!");
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to join ride"));
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: (coords: [number, number]) =>
      updateStartLocationOverride(id!, coords),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
      Alert.alert("Success", "Starting location updated successfully!");
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        getApiErrorMessage(err, "Failed to update location"),
      );
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (riderId: string) => promoteRider(id!, riderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
      Alert.alert("Success", "Rider promoted to co-captain!");
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to promote"));
    },
  });

  const stopMutation = useMutation({
    mutationFn: ({ stopId, status }: { stopId: string; status: string }) =>
      handleStop(id!, stopId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to update stop"));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateRideStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
      queryClient.invalidateQueries({ queryKey: ["rides"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to update status"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRideReq,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rides"] });
      Alert.alert("Success", "Ride deleted successfully");
      router.replace("/(tabs)/rides");
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to delete ride"));
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      submitRideReview(id!, {
        rating: reviewRating,
        review_text: reviewText.trim() || undefined,
      }),
    onSuccess: () => {
      setReviewRating(0);
      setReviewText("");
      queryClient.invalidateQueries({ queryKey: ["ride-reviews", id] });
      Alert.alert("Success", "Review submitted successfully");
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to submit review"));
    },
  });

  const liveStartMutation = useMutation({
    mutationFn: () => startLiveSessionReq(id!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ride", id] }),
        queryClient.invalidateQueries({ queryKey: ["live-session", id] }),
      ]);
      if (token) {
        connect(token);
      }
      await refetchLiveSession();
      joinRoom(id!);
      router.replace(`/ride/${id}/navigation` as any);
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        getApiErrorMessage(err, "Failed to start live session"),
      );
    },
  });

  const liveEndMutation = useMutation({
    mutationFn: (options?: { markRideCompleted?: boolean; reason?: string }) =>
      endLiveSessionReq(id!, options),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ride", id] }),
        queryClient.invalidateQueries({ queryKey: ["live-session", id] }),
      ]);
      refetchLiveSession();
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        getApiErrorMessage(err, "Failed to end live session"),
      );
    },
  });

  const liveSOSMutation = useMutation({
    mutationFn: (payload?: { lon: number; lat: number }) =>
      reportSOSReq(id!, payload),
    onSuccess: () => {
      Alert.alert("SOS sent", "Your critical SOS incident has been reported.");
      refetchLiveSession();
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to report SOS"));
    },
  });

  const handleSOS = () => {
    Alert.alert(
      "Send SOS?",
      "This will report a critical incident to ride leaders immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send SOS",
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (sosSubmitting || liveSOSMutation.isPending) {
                return;
              }

              setSOSSubmitting(true);

              try {
                const coords = await getSOSCoords();

                if (inRoom) {
                  reportSOS(coords);
                  Alert.alert(
                    "SOS sent",
                    "Your critical SOS incident has been reported.",
                  );
                  void refetchLiveSession();
                } else {
                  await liveSOSMutation.mutateAsync(coords);
                }
              } finally {
                setSOSSubmitting(false);
              }
            })();
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!shouldEnableLiveSocket || !token) {
      reset();
      return;
    }

    connect(token);

    return () => {
      reset();
    };
  }, [connect, reset, shouldEnableLiveSocket, token]);

  useEffect(() => {
    if (!shouldEnableLiveSocket || !id) {
      clearRideContext();
      return;
    }

    setRideContext(id);

    return () => {
      clearRideContext();
    };
  }, [
    clearRideContext,
    id,
    shouldEnableLiveSocket,
    setRideContext,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, [liveEnabled]);

  useEffect(() => {
    const shouldAutoJoin =
      shouldEnableLiveSocket &&
      Boolean(id) &&
      appState === "active" &&
      liveConnected &&
      !inRoom &&
      !isJoining;

    if (shouldAutoJoin) {
      joinRoom(id!);
    }
  }, [
    appState,
    id,
    inRoom,
    isJoining,
    joinRoom,
    liveConnected,
    shouldEnableLiveSocket,
  ]);

  useEffect(() => {
    if (!inRoom || appState !== "active") {
      return;
    }

    const timer = setInterval(() => {
      sendHeartbeat();
    }, 10000);

    return () => {
      clearInterval(timer);
    };
  }, [appState, inRoom, sendHeartbeat]);

  useEffect(() => {
    if (!inRoom || appState !== "active" || Platform.OS === "web") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const publishCurrentLocation = async () => {
      try {
        const position = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });

        if (cancelled) {
          return;
        }

        const speedMs = position.coords.speed;
        const heading = position.coords.heading;
        const accuracy = position.coords.accuracy;

        upsertLocation({
          lon: position.coords.longitude,
          lat: position.coords.latitude,
          speed_kmh:
            typeof speedMs === "number" &&
            Number.isFinite(speedMs) &&
            speedMs >= 0
              ? speedMs * 3.6
              : undefined,
          heading_deg:
            typeof heading === "number" &&
            Number.isFinite(heading) &&
            heading >= 0 &&
            heading < 360
              ? heading
              : undefined,
          accuracy_m:
            typeof accuracy === "number" &&
            Number.isFinite(accuracy) &&
            accuracy >= 0
              ? accuracy
              : undefined,
          captured_at: new Date(position.timestamp).toISOString(),
        });
      } catch {
        // Silent fallback: presence and incidents still work even if location fails.
      }
    };

    const start = async () => {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (cancelled || permission.status !== "granted") {
        return;
      }

      await publishCurrentLocation();
      timer = setInterval(() => {
        void publishCurrentLocation();
      }, 5000);
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [appState, inRoom, upsertLocation]);

  useEffect(() => {
    if (appState !== "active" || Platform.OS === "web") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const sampleLocation = async () => {
      try {
        const position = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });

        if (cancelled) {
          return;
        }

        setSampledLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        // Keep existing fallback behavior when location is unavailable.
      }
    };

    const startSampling = async () => {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (cancelled || permission.status !== "granted") {
        return;
      }

      await sampleLocation();
      timer = setInterval(() => {
        void sampleLocation();
      }, 12000);
    };

    void startSampling();

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [appState]);

  // Alert when session is ended remotely via socket fanout
  const prevSessionEndedRef = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = liveSocketSession?.status;
    if (currentStatus === "ended" && prevSessionEndedRef.current !== "ended") {
      Alert.alert("Live Session Ended", getSessionEndedMessage(sessionEndedReason));
    }
    prevSessionEndedRef.current = currentStatus ?? null;
  }, [liveSocketSession?.status, sessionEndedReason]);

  // ── Ride-room WebSocket subscription ────────────────────────────────────────
  // Subscribe to ride-level events (join, stop requests, stop updates) via the
  // /rides namespace so all participants get real-time UI updates.
  useEffect(() => {
    if (!id || !token) return;

    rideSocket.connect(token);
    rideSocket.subscribe(id);

    const handleJoined = () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
      queryClient.invalidateQueries({ queryKey: ["rides"] });
    };

    const handleStopRequested = () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
    };

    const handleStopUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
    };

    rideSocket.on("ride:joined", handleJoined);
    rideSocket.on("ride:stop_requested", handleStopRequested);
    rideSocket.on("ride:stop_updated", handleStopUpdated);

    return () => {
      rideSocket.off("ride:joined", handleJoined);
      rideSocket.off("ride:stop_requested", handleStopRequested);
      rideSocket.off("ride:stop_updated", handleStopUpdated);
      rideSocket.unsubscribe(id);
    };
  }, [id, token, queryClient]);

  // Auto-fit map to live participant locations when riding
  useEffect(() => {
    if (!inRoom || !mapRef.current) {
      return;
    }
    const markers = Object.values(locations).filter(
      (loc) =>
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lon) &&
        (presence[loc.riderId]?.isOnline ?? true),
    );
    if (markers.length < 2) {
      return;
    }
    mapRef.current.fitToCoordinates(
      markers.map((m) => ({ latitude: m.lat, longitude: m.lon })),
      {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      },
    );
  }, [inRoom, locations, presence]);

  const startPoint = useMemo(
    () => toCoordinate(ride?.start_point_geojson?.coordinates || null),
    [ride?.start_point_geojson?.coordinates],
  );
  const destinationPoint = useMemo(
    () => toCoordinate(ride?.end_point_geojson?.coordinates || null),
    [ride?.end_point_geojson?.coordinates],
  );
  const approvedStopCoords = useMemo(() => {
    if (!ride?.stops) {
      return [] as LatLng[];
    }

    return ride.stops
      .filter((stop: any) => stop.status !== "rejected" && stop.location?.coordinates)
      .map((stop: any) => ({
        latitude: stop.location.coordinates[1],
        longitude: stop.location.coordinates[0],
      }));
  }, [ride?.stops]);

  const currentLocationOrigin = useMemo(() => {
    const ownLiveLocation = Object.values(locations).find(
      (location) => location.riderId === currentRider?.id,
    );

    if (
      ownLiveLocation &&
      Number.isFinite(ownLiveLocation.lat) &&
      Number.isFinite(ownLiveLocation.lon)
    ) {
      return {
        latitude: ownLiveLocation.lat,
        longitude: ownLiveLocation.lon,
      } as LatLng;
    }

    return sampledLocation;
  }, [currentRider?.id, locations, sampledLocation]);

  const canonicalRoute = useMemo(
    () =>
      buildCanonicalRideRouteInput({
        origin: currentLocationOrigin,
        start: startPoint,
        stops: approvedStopCoords,
        destination: destinationPoint,
      }),
    [approvedStopCoords, currentLocationOrigin, destinationPoint, startPoint],
  );

  const canonicalRouteKey = useMemo(() => {
    if (!canonicalRoute) {
      return "";
    }

    return canonicalRoute.orderedPoints
      .map((point) => `${point.latitude},${point.longitude}`)
      .join("|");
  }, [canonicalRoute]);

  useEffect(() => {
    if (!canonicalRoute || appState !== "active") {
      setRoutePathCoordinates(canonicalRoute?.orderedPoints || []);
      return;
    }

    const now = Date.now();
    const previousOrigin = lastRouteOriginRef.current;
    const movedMeters =
      previousOrigin && currentLocationOrigin
        ? haversineMeters(previousOrigin, currentLocationOrigin)
        : Infinity;
    const elapsedMs = now - lastRouteRefreshAtRef.current;
    const shouldRefresh =
      routePathCoordinates.length === 0 || movedMeters >= 40 || elapsedMs >= 25000;

    if (!shouldRefresh) {
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      try {
        const route = await fetchNavigationRoute({
          origin: canonicalRoute.origin,
          destination: canonicalRoute.destination,
          waypoints: canonicalRoute.waypoints,
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        });

        if (cancelled) {
          return;
        }

        setRoutePathCoordinates(
          route.polyline.length > 1 ? route.polyline : canonicalRoute.orderedPoints,
        );
        lastRouteOriginRef.current = canonicalRoute.origin;
        lastRouteRefreshAtRef.current = Date.now();
      } catch {
        if (!cancelled) {
          setRoutePathCoordinates(canonicalRoute.orderedPoints);
        }
      }
    };

    void loadRoute();

    return () => {
      cancelled = true;
    };
  }, [
    appState,
    canonicalRoute,
    canonicalRouteKey,
    currentLocationOrigin,
    routePathCoordinates.length,
  ]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    const tasks: Array<Promise<unknown>> = [refetch(), refetchReviews()];
    if (liveEnabled && isParticipantFromRide) {
      tasks.push(refetchLiveSession());
    }
    await Promise.all(tasks);
  });

  if (isLoading) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError || !ride) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <Text className='font-bold' style={{ color: colors.danger }}>
          Failed to load ride details.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className='mt-4 p-3 rounded-xl'
        >
          <Text className='font-bold' style={{ color: colors.text }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const startCoords = ride.start_point_geojson?.coordinates;
  const endCoords = ride.end_point_geojson?.coordinates;
  const isParticipant = isParticipantFromRide;
  const isCaptain = ride.captain_id === currentRider?.id;
  const isCoCaptain = ride.participants?.some(
    (p: any) => p.rider_id === currentRider?.id && p.role === "co_captain",
  );
  const isLeader = isCaptain || isCoCaptain;
  const hasReviewed = Boolean(
    reviews?.some((r) => r.rider_id === currentRider?.id),
  );
  const canReview =
    ride.status === "completed" && isParticipant && !hasReviewed;
  const isFull =
    ride.max_capacity && ride.current_rider_count >= ride.max_capacity;
  const dateStr = new Date(ride.scheduled_at).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const nextAction = NEXT_STATUS[ride.status];
  const onlineCount = Object.values(presence).filter(
    (member) => member.isOnline,
  ).length;
  const liveConnectionLabel = !liveConnected
    ? "Socket offline"
    : isJoining
      ? "Joining live room..."
      : inRoom
        ? "Live room joined"
        : "Socket connected";

  // Collect approved stop markers
  const stopMarkers = (ride.stops || []).filter(
    (s: any) => s.status !== "rejected",
  );

  const liveLocationMarkers = Object.values(locations).filter((location) => {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
      return false;
    }

    return presence[location.riderId]?.isOnline ?? true;
  });

  const currentRiderLiveLocation = liveLocationMarkers.find(
    (location) => location.riderId === currentRider?.id,
  );

  const handleGetDirections = () => {
    if (!startCoords) return;
    showLocation({
      latitude: startCoords[1],
      longitude: startCoords[0],
      title: "Ride Start Point",
      dialogTitle: "Navigate to Start Point",
      dialogMessage: "Choose your preferred maps app",
      cancelText: "Cancel",
    });
  };

  const handlePromote = (riderId: string, name: string) => {
    Alert.alert("Promote to Co-Captain", `Promote ${name} to co-captain?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Promote", onPress: () => promoteMutation.mutate(riderId) },
    ]);
  };

  const handleJoinAttempt = () => {
    if (ride.start_point_auto) {
      Alert.alert(
        "Auto-Calculate Start Point",
        "This ride automatically groups everyone based on their Home Location. Do you want to use your saved Home Location, or set a different starting point for this specific ride?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Override",
            onPress: () => setShowJoinOverridePicker(true),
          },
          { text: "Use Home", onPress: () => joinMutation.mutate(undefined) },
        ],
      );
    } else {
      joinMutation.mutate(undefined);
    }
  };

  const handleStatusChange = () => {
    if (!nextAction) return;

    const shouldStartLiveWithRide =
      liveEnabled && isLeader && nextAction.status === "active";
    const shouldEndLiveWithRide =
      liveEnabled &&
      isLeader &&
      nextAction.status === "completed" &&
      (liveStatus === "active" ||
        liveStatus === "starting" ||
        liveStatus === "paused");

    Alert.alert(
      `${nextAction.label}?`,
      shouldStartLiveWithRide
        ? "This will start the ride and begin the live session."
        : shouldEndLiveWithRide
          ? "This will complete the ride and end the live session."
          : `Change ride status to ${nextAction.status}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextAction.label,
          onPress: () => {
            if (shouldStartLiveWithRide) {
              liveStartMutation.mutate();
              return;
            }

            if (shouldEndLiveWithRide) {
              liveEndMutation.mutate({
                markRideCompleted: true,
                reason: "ride_completed",
              });
              return;
            }

            statusMutation.mutate(nextAction.status);
          },
        },
      ],
    );
  };

  const handleDeleteRide = () => {
    Alert.alert(
      "Delete Ride?",
      "Are you sure you want to delete this ride? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(id as string),
        },
      ],
    );
  };

  const stopIcon = (type: string) => {
    if (type === "fuel") return "⛽";
    if (type === "rest") return "☕";
    if (type === "photo") return "📸";
    return "📍";
  };

  const averageRating = reviews?.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      {/* Map Header */}
      <View className='h-72 w-full relative'>
        {startCoords && (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            userInterfaceStyle='dark'
            initialRegion={{
              latitude: startCoords[1],
              longitude: startCoords[0],
              latitudeDelta: 0.2,
              longitudeDelta: 0.2,
            }}
          >
            <Marker
              coordinate={{
                latitude: startCoords[1],
                longitude: startCoords[0],
              }}
              title='Start'
              pinColor='#22c55e'
            />
            {endCoords && (
              <>
                <Marker
                  coordinate={{
                    latitude: endCoords[1],
                    longitude: endCoords[0],
                  }}
                  title='End'
                  pinColor='#f43f5e'
                />
                <Polyline
                  coordinates={routePathCoordinates}
                  strokeColor='#22c55e'
                  strokeWidth={4}
                  lineDashPattern={[10, 10]}
                />
              </>
            )}
            {stopMarkers
              .filter((s: any) => s.location?.coordinates)
              .map((s: any, i: number) => (
                <Marker
                  key={`stop-${i}`}
                  coordinate={{
                    latitude: s.location.coordinates[1],
                    longitude: s.location.coordinates[0],
                  }}
                  pinColor='#f59e0b'
                  title={`${s.type} stop`}
                />
              ))}

            {liveEnabled &&
              (liveStatus === "active" ||
                liveStatus === "starting" ||
                liveStatus === "paused") &&
              liveLocationMarkers.map((marker) => {
                const participant = ride.participants?.find(
                  (p: any) => p.rider_id === marker.riderId,
                );

                const isCurrentRider = marker.riderId === currentRider?.id;
                const role = participant?.role || "rider";
                const roleLabel =
                  role === "captain"
                    ? "Captain"
                    : role === "co_captain"
                      ? "Co-Captain"
                      : "Rider";

                const speedLabel =
                  marker.speedKmh != null
                    ? ` · ${Math.round(marker.speedKmh)} km/h`
                    : "";
                const headingLabel =
                  marker.headingDeg != null
                    ? ` · ${Math.round(marker.headingDeg)}°`
                    : "";

                return (
                  <Marker
                    key={`live-marker-${marker.riderId}`}
                    coordinate={{
                      latitude: marker.lat,
                      longitude: marker.lon,
                    }}
                    pinColor={
                      isCurrentRider
                        ? "#2563eb"
                        : role === "captain"
                          ? "#22c55e"
                          : role === "co_captain"
                            ? "#f59e0b"
                            : "#0ea5e9"
                    }
                    title={
                      isCurrentRider
                        ? "You"
                        : participant?.display_name ||
                          marker.riderId.slice(0, 8)
                    }
                    description={`${roleLabel}${speedLabel}${headingLabel}`}
                  />
                );
              })}
          </MapView>
        )}
        <SafeAreaView className='absolute top-0 left-0 right-0 px-4 pt-2 flex-row justify-between items-center'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='w-10 h-10 rounded-full items-center justify-center'
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          >
            <ChevronLeft color='white' size={24} />
          </TouchableOpacity>
          {/* Status Badge */}
          <View
            className='px-3 py-1 rounded-full'
            style={{
              backgroundColor: STATUS_COLORS[ride.status] || colors.border,
            }}
          >
            <Text className='text-xs font-bold' style={{ color: "#ffffff" }}>
              {STATUS_LABELS[ride.status] || ride.status}
            </Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        className='flex-1'
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* Title & Captain */}
        <View
          className='p-5'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <View className='flex-row justify-between items-start'>
            <Text
              className='text-3xl font-bold flex-1 mr-2'
              style={{ color: colors.text }}
            >
              {ride.title}
            </Text>
            {isLeader && (
              <View className='flex-row items-center'>
                {isCaptain &&
                  ride.status !== "active" &&
                  ride.status !== "completed" && (
                    <TouchableOpacity
                      onPress={handleDeleteRide}
                      className='p-2 rounded-full mr-2'
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.danger + "80",
                      }}
                    >
                      <Trash2 color={colors.danger} size={20} />
                    </TouchableOpacity>
                  )}
                {ride.status !== "completed" && ride.status !== "cancelled" && (
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/(modals)/create-ride",
                        params: { editRide: JSON.stringify(ride) },
                      })
                    }
                    className='p-2 rounded-full'
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Edit3 color={colors.text} size={20} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <Text
            className='text-sm mb-4 mt-2'
            style={{ color: colors.textMuted }}
          >
            Hosted by{" "}
            <Text className='font-bold' style={{ color: colors.text }}>
              {ride.captain_name}
            </Text>
          </Text>
          <View className='flex-row items-center mb-3'>
            <Calendar color={colors.primary} size={20} />
            <Text className='text-base ml-3' style={{ color: colors.text }}>
              {dateStr}
            </Text>
          </View>
          <View className='flex-row flex-wrap mt-2'>
            <View className='w-1/2 flex-row items-center mb-4'>
              <Users color={colors.textMuted} size={18} />
              <Text className='ml-2' style={{ color: colors.textMuted }}>
                {ride.current_rider_count}
                {ride.max_capacity ? ` / ${ride.max_capacity}` : ""} Joined
              </Text>
            </View>
            <View className='w-1/2 flex-row items-center mb-4'>
              <Gauge color={colors.textMuted} size={18} />
              <Text className='ml-2' style={{ color: colors.textMuted }}>
                {ride.estimated_duration_min
                  ? ride.estimated_duration_min >= 60
                    ? `${Math.floor(ride.estimated_duration_min / 60)}h ${ride.estimated_duration_min % 60 ? `${ride.estimated_duration_min % 60}m` : ''}`.trim()
                    : `${ride.estimated_duration_min}m`
                  : 'TBD'}{' '}
                Duration
              </Text>
            </View>
          </View>
          {startCoords && (
            <TouchableOpacity
              onPress={handleGetDirections}
              className='flex-row items-center p-3 rounded-xl mt-2'
              style={{
                backgroundColor: colors.primary + "1A",
                borderWidth: 1,
                borderColor: colors.primary + "4D",
              }}
            >
              <Navigation color={colors.primary} size={20} />
              <Text
                className='font-bold ml-2'
                style={{ color: colors.primary }}
              >
                Get Directions to Start Point
              </Text>
            </TouchableOpacity>
          )}

          {/* Captain: Status Advance Button */}
          {isLeader && nextAction && (
            <TouchableOpacity
              onPress={handleStatusChange}
              disabled={statusMutation.isPending || liveStartMutation.isPending}
              className='p-3 rounded-xl mt-3 items-center'
              style={{ backgroundColor: colors.primary }}
            >
              {statusMutation.isPending || liveStartMutation.isPending ? (
                <ActivityIndicator color='white' size='small' />
              ) : (
                <Text className='font-bold' style={{ color: "#ffffff" }}>
                  {nextAction.label}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* About */}
        {liveEnabled && isParticipant && (
          <View
            className='p-5'
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <View className='flex-row items-center justify-between mb-3'>
              <Text
                className='text-xl font-bold'
                style={{ color: colors.text }}
              >
                Live Session
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                {liveConnectionLabel}
              </Text>
            </View>

            <View
              className='p-4 rounded-xl mb-3'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text className='font-semibold' style={{ color: colors.text }}>
                Status:{" "}
                {liveStatus === "not_started" ? "Not Started" : liveStatus}
              </Text>
              <Text className='mt-1' style={{ color: colors.textMuted }}>
                Riders online: {onlineCount}
              </Text>
              <Text className='mt-1' style={{ color: colors.textMuted }}>
                Incidents in this session: {incidents.length}
              </Text>
              {appState !== "active" ? (
                <Text className='mt-1' style={{ color: colors.textMuted }}>
                  App is backgrounded. Heartbeat/location updates are paused.
                </Text>
              ) : null}
              {liveError && liveError !== "Live session not found" ? (
                <Text className='mt-2' style={{ color: colors.danger }}>
                  {liveError}
                </Text>
              ) : null}
            </View>

            {(liveStatus === "active" || liveStatus === "starting") && (
              <TouchableOpacity
                onPress={() => router.push(`/ride/${id}/navigation` as any)}
                className='p-3 rounded-xl'
                style={{
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  className='font-bold text-center'
                  style={{ color: "#ffffff" }}
                >
                  Open Full-Screen Navigation
                </Text>
              </TouchableOpacity>
            )}

            {/* Live presence list */}
            {(liveStatus === "active" ||
              liveStatus === "starting" ||
              liveStatus === "paused") &&
              liveSocketSession?.participants &&
              liveSocketSession.participants.length > 0 && (
                <View className='mb-3'>
                  <Text
                    className='text-sm font-semibold mb-2'
                    style={{ color: colors.textMuted }}
                  >
                    Participants
                  </Text>
                  <View className='flex-row flex-wrap'>
                    {liveSocketSession.participants.map((p) => {
                      const isOnline =
                        presence[p.rider_id]?.isOnline ?? p.is_online;
                      const loc = locations[p.rider_id];
                      const roleLabel =
                        p.role === "captain"
                          ? "Captain"
                          : p.role === "co_captain"
                            ? "Co-Captain"
                            : "Rider";
                      const speedText =
                        loc?.speedKmh != null
                          ? ` · ${Math.round(loc.speedKmh)} km/h`
                          : "";
                      return (
                        <View
                          key={p.rider_id}
                          className='flex-row items-center mr-3 mb-2 px-2 py-1 rounded-full'
                          style={{
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: isOnline
                              ? colors.primary + "66"
                              : colors.border,
                          }}
                        >
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: isOnline
                                ? "#22c55e"
                                : colors.textMuted,
                              marginRight: 6,
                            }}
                          />
                          <Text
                            className='text-xs'
                            style={{ color: colors.text }}
                          >
                            {p.display_name}
                          </Text>
                          <Text
                            className='text-xs ml-1'
                            style={{ color: colors.textMuted }}
                          >
                            {roleLabel}
                            {speedText}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

            <View className='flex-row flex-wrap'>
              {isLeader &&
                ride.status === "active" &&
                (liveStatus === "not_started" || liveStatus === "ended") && (
                  <TouchableOpacity
                    onPress={() => liveStartMutation.mutate()}
                    disabled={liveStartMutation.isPending}
                    className='px-4 py-2 rounded-xl mr-2 mb-2'
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Text className='font-bold text-white'>
                      {liveStartMutation.isPending
                        ? "Starting..."
                        : "Start Live"}
                    </Text>
                  </TouchableOpacity>
                )}

              {(liveStatus === "active" ||
                liveStatus === "starting" ||
                inRoom) && (
                <TouchableOpacity
                  onPress={handleSOS}
                  disabled={liveSOSMutation.isPending || sosSubmitting}
                  className='px-4 py-2 rounded-xl mr-2 mb-2'
                  style={{ backgroundColor: colors.danger }}
                >
                  <Text className='font-bold text-white'>
                    {liveSOSMutation.isPending || sosSubmitting
                      ? "Sending SOS..."
                      : "SOS"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {liveSessionLoading ? (
              <ActivityIndicator
                size='small'
                color={colors.primary}
                className='mt-3'
              />
            ) : null}
          </View>
        )}

        {/* About */}
        <View
          className='p-5'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text
            className='text-xl font-bold mb-3'
            style={{ color: colors.text }}
          >
            About this Ride
          </Text>
          <Text className='leading-6' style={{ color: colors.textMuted }}>
            {ride.description || "No description provided."}
          </Text>
        </View>

        {/* Requirements */}
        <View
          className='p-5'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text
            className='text-xl font-bold mb-3'
            style={{ color: colors.text }}
          >
            Requirements
          </Text>
          {ride.requirements ? (
            <View
              className='p-4 rounded-xl'
              style={{ borderWidth: 1, borderColor: colors.border }}
            >
              {ride.requirements.min_experience && (
                <>
                  <Text
                    className='mb-1 font-bold'
                    style={{ color: colors.text }}
                  >
                    Experience:
                  </Text>
                  <Text
                    className='font-bold capitalize mb-3'
                    style={{ color: colors.primary }}
                  >
                    {ride.requirements.min_experience}
                  </Text>
                </>
              )}
              {ride.requirements.mandatory_gear?.length > 0 && (
                <>
                  <Text
                    className='mb-2 font-bold'
                    style={{ color: colors.text }}
                  >
                    Mandatory Gear:
                  </Text>
                  <View className='flex-row flex-wrap mb-3'>
                    {ride.requirements.mandatory_gear.map(
                      (g: string, i: number) => (
                        <View
                          key={i}
                          className='px-3 py-1 rounded-full mr-2 mb-2'
                          style={{ backgroundColor: colors.surface }}
                        >
                          <Text
                            className='text-sm capitalize'
                            style={{ color: colors.text }}
                          >
                            {g}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                </>
              )}
              {ride.requirements.vehicle_type && (
                <>
                  <Text
                    className='mb-1 font-bold'
                    style={{ color: colors.text }}
                  >
                    Vehicle Type:
                  </Text>
                  <Text
                    className='font-bold capitalize'
                    style={{ color: colors.primary }}
                  >
                    {ride.requirements.vehicle_type}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <Text style={{ color: colors.textMuted }}>None specified.</Text>
          )}
        </View>

        {/* Stops */}
        {ride.stops && ride.stops.length > 0 && (
          <View
            className='p-5'
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Text
              className='text-xl font-bold mb-3'
              style={{ color: colors.text }}
            >
              Stops
            </Text>
            {ride.stops.map((stop: any, i: number) => (
              <View
                key={i}
                className='flex-row items-center justify-between p-3 rounded-xl mb-2'
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View className='flex-row items-center flex-1'>
                  <Text className='text-lg mr-2'>{stopIcon(stop.type)}</Text>
                  <View>
                    <Text
                      className='font-bold capitalize'
                      style={{ color: colors.text }}
                    >
                      {stop.type} Stop
                    </Text>
                    <Text
                      className='text-xs'
                      style={{ color: colors.textMuted }}
                    >
                      by {stop.requester_name || "Unknown"}
                    </Text>
                  </View>
                </View>
                {/* Status Badge */}
                <View className='flex-row items-center'>
                  {stop.status === "approved" && (
                    <CheckCircle color='#22c55e' size={16} />
                  )}
                  {stop.status === "rejected" && (
                    <XCircle color='#ef4444' size={16} />
                  )}
                  {stop.status === "pending" && (
                    <Clock color='#f59e0b' size={16} />
                  )}
                  <Text
                    className='ml-1 text-xs font-bold capitalize'
                    style={{
                      color:
                        stop.status === "approved"
                          ? "#22c55e"
                          : stop.status === "rejected"
                            ? "#ef4444"
                            : "#f59e0b",
                    }}
                  >
                    {stop.status}
                  </Text>
                </View>
                {/* Captain: Approve/Reject pending stops */}
                {isLeader && stop.status === "pending" && (
                  <View className='flex-row ml-2'>
                    <TouchableOpacity
                      onPress={() =>
                        stopMutation.mutate({
                          stopId: stop.id,
                          status: "approved",
                        })
                      }
                      className='w-8 h-8 rounded-full items-center justify-center mr-1'
                      style={{ backgroundColor: "#22c55e20" }}
                    >
                      <CheckCircle color='#22c55e' size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        stopMutation.mutate({
                          stopId: stop.id,
                          status: "rejected",
                        })
                      }
                      className='w-8 h-8 rounded-full items-center justify-center'
                      style={{ backgroundColor: "#ef444420" }}
                    >
                      <XCircle color='#ef4444' size={18} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Participants */}
        <View className='p-5 mb-10'>
          <Text
            className='text-xl font-bold mb-4'
            style={{ color: colors.text }}
          >
            Participants ({ride.participants?.length || 0})
          </Text>
          {ride.participants?.map((p: any, i: number) => (
            <View
              key={i}
              className='flex-row items-center mb-3 p-3 rounded-2xl'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TouchableOpacity
                onPress={() => router.push(`/rider/${p.rider_id}` as any)}
                className='flex-1 flex-row items-center mr-2'
                activeOpacity={0.8}
              >
                <View
                  className='w-10 h-10 rounded-full items-center justify-center mr-3'
                  style={{ backgroundColor: colors.border }}
                >
                  <Text
                    className='font-bold text-lg'
                    style={{ color: colors.text }}
                  >
                    {p.display_name?.charAt(0)}
                  </Text>
                </View>
                <View className='flex-1'>
                  <View className='flex-row items-center'>
                    <Text
                      className='font-bold text-base'
                      style={{ color: colors.text }}
                    >
                      {p.display_name}
                    </Text>
                    {/* Role Badge */}
                    {p.role === "captain" && (
                      <View
                        className='ml-2 px-2 py-0.5 rounded-full'
                        style={{ backgroundColor: colors.primary }}
                      >
                        <Text
                          className='text-[10px] font-bold'
                          style={{ color: "#ffffff" }}
                        >
                          Captain
                        </Text>
                      </View>
                    )}
                    {p.role === "co_captain" && (
                      <View
                        className='ml-2 px-2 py-0.5 rounded-full flex-row items-center'
                        style={{ backgroundColor: "#3b82f6" }}
                      >
                        <Shield color='#ffffff' size={10} />
                        <Text
                          className='text-[10px] font-bold ml-0.5'
                          style={{ color: "#ffffff" }}
                        >
                          Co-Captain
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    className='text-xs capitalize'
                    style={{ color: colors.textMuted }}
                  >
                    {p.role.replace("_", "-")}
                  </Text>
                </View>
              </TouchableOpacity>
              {/* Captain: Promote button for regular riders */}
              {isCaptain && p.role === "rider" && (
                <TouchableOpacity
                  onPress={() => handlePromote(p.rider_id, p.display_name)}
                  className='px-3 py-1.5 rounded-full'
                  style={{ borderWidth: 1, borderColor: "#3b82f6" }}
                >
                  <Text
                    className='text-xs font-bold'
                    style={{ color: "#3b82f6" }}
                  >
                    Promote
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Ride Reviews */}
        <View
          className='px-5 pb-10'
          style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <View className='flex-row items-center justify-between mt-5 mb-3'>
            <Text className='text-xl font-bold' style={{ color: colors.text }}>
              Ride Reviews
            </Text>
            <View className='flex-row items-center'>
              <Star color='#f59e0b' fill='#f59e0b' size={16} />
              <Text
                className='ml-1 font-semibold'
                style={{ color: colors.text }}
              >
                {reviews?.length ? averageRating.toFixed(1) : "0.0"}
              </Text>
              <Text className='ml-1' style={{ color: colors.textMuted }}>
                ({reviews?.length || 0})
              </Text>
            </View>
          </View>

          {canReview ? (
            <View
              className='p-4 rounded-2xl mb-4'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                className='font-semibold mb-2'
                style={{ color: colors.text }}
              >
                Rate this ride
              </Text>
              <View className='flex-row mb-3'>
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= reviewRating;
                  return (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setReviewRating(star)}
                      className='mr-2'
                    >
                      <Star
                        size={24}
                        color={active ? "#f59e0b" : colors.textMuted}
                        fill={active ? "#f59e0b" : "transparent"}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                placeholder='Share your experience (optional)'
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  minHeight: 90,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                  borderRadius: 12,
                  padding: 12,
                  color: colors.text,
                  textAlignVertical: "top",
                  marginBottom: 12,
                }}
                maxLength={2000}
              />
              <TouchableOpacity
                disabled={reviewRating < 1 || reviewMutation.isPending}
                onPress={() => reviewMutation.mutate()}
                className='p-3 rounded-xl items-center'
                style={{
                  backgroundColor:
                    reviewRating < 1 || reviewMutation.isPending
                      ? colors.border
                      : colors.primary,
                }}
              >
                {reviewMutation.isPending ? (
                  <ActivityIndicator size='small' color='#ffffff' />
                ) : (
                  <Text className='font-bold text-white'>Submit Review</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View
              className='p-4 rounded-2xl mb-4'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted }}>
                {ride.status !== "completed"
                  ? "Reviews open after the ride is completed."
                  : !isParticipant
                    ? "Only participants can submit a review."
                    : hasReviewed
                      ? "You have already submitted a review for this ride."
                      : "You cannot submit a review right now."}
              </Text>
            </View>
          )}

          {reviewsLoading ? (
            <ActivityIndicator
              size='small'
              color={colors.primary}
              className='my-6'
            />
          ) : reviews && reviews.length > 0 ? (
            reviews.map((review) => (
              <View
                key={review.id}
                className='p-4 rounded-2xl mb-3'
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View className='flex-row justify-between items-center mb-1'>
                  <Text className='font-bold' style={{ color: colors.text }}>
                    {review.reviewer_name}
                  </Text>
                  <Text className='text-xs' style={{ color: colors.textMuted }}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View className='flex-row mb-2'>
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const active = idx < review.rating;
                    return (
                      <Star
                        key={`${review.id}-${idx}`}
                        size={14}
                        color={active ? "#f59e0b" : colors.textMuted}
                        fill={active ? "#f59e0b" : "transparent"}
                        style={{ marginRight: 3 }}
                      />
                    );
                  })}
                </View>
                <Text style={{ color: colors.textMuted }}>
                  {review.review_text || "No written feedback."}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.textMuted }}>No reviews yet.</Text>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <View className='absolute bottom-6 left-5 right-5 pb-5 pt-4'>
        {isParticipant ? (
          <View
            className='p-4 rounded-2xl w-full shadow-lg'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              className='font-bold text-center text-lg'
              style={{ color: colors.text }}
            >
              You are participating in this ride! 🎉
            </Text>
            {ride.start_point_auto &&
              ride.status === "scheduled" &&
              new Date(ride.scheduled_at).getTime() - Date.now() >
                12 * 60 * 60 * 1000 && (
                <LocationPicker
                  label='Update Starting Location'
                  onSelect={(result) =>
                    updateLocationMutation.mutate(result.coords)
                  }
                  customTrigger={(showModal) => (
                    <TouchableOpacity
                      onPress={showModal}
                      className='mt-3 p-3 rounded-xl items-center'
                      style={{ backgroundColor: colors.primary }}
                    >
                      {updateLocationMutation.isPending ? (
                        <ActivityIndicator color='white' />
                      ) : (
                        <Text className='font-bold text-white'>
                          Update Starting Location
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                />
              )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleJoinAttempt}
            disabled={joinMutation.isPending || isFull}
            className='p-4 rounded-2xl shadow-lg'
            style={{ backgroundColor: isFull ? colors.border : colors.primary }}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text
                className='font-bold text-center text-lg'
                style={{ color: "#ffffff" }}
              >
                {isFull ? "Ride is Full" : "Join Ride"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Hidden Location Picker for Join Flow Override */}
      {showJoinOverridePicker && (
        <LocationPicker
          label='Set Override Location'
          visible={showJoinOverridePicker}
          onClose={() => setShowJoinOverridePicker(false)}
          onSelect={(result) => {
            setShowJoinOverridePicker(false);
            joinMutation.mutate(result.coords);
          }}
          customTrigger={() => <View />}
        />
      )}
    </View>
  );
}
