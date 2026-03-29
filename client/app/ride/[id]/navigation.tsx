import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ExpoLocation from "expo-location";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "../../../src/components/MapWrapper";
import { apiClient } from "../../../src/api/client";
import { useAuthStore } from "../../../src/store/authStore";
import { useLiveSessionStore } from "../../../src/store/liveSessionStore";
import { useTheme } from "../../../src/theme/ThemeContext";
import { NavigationBottomSheet } from "../../../src/features/navigation/components/NavigationBottomSheet";
import { NavigationInstructionOverlay } from "../../../src/features/navigation/components/NavigationInstructionOverlay";
import {
  fetchNavigationRoute,
  haversineMeters,
} from "../../../src/features/navigation/services/navigationRouteService";
import type {
  LatLng,
  NavigationRoute,
  RideParticipantView,
} from "../../../src/features/navigation/types/navigation";
import { ChevronLeft } from "lucide-react-native";

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1f2937" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#111827" }],
  },
];

const fetchRideDetails = async (id: string) => {
  const { data } = await apiClient.get(`/api/rides/${id}`);
  return data.ride;
};

const fetchLiveSession = async (rideId: string) => {
  const { data } = await apiClient.get(`/api/rides/${rideId}/live/session`);
  return data.session;
};

const startLiveSessionReq = async (rideId: string) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/live/start`);
  return data;
};

const endLiveSessionReq = async (rideId: string) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/live/end`, {
    mark_ride_completed: true,
    reason: "ride_completed",
  });
  return data;
};

const formatDistance = (distanceMeters: number): string => {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return "--";
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
};

const formatEta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }

  const eta = new Date(Date.now() + seconds * 1000);
  return eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const calculateForwardOffset = (
  location: LatLng,
  headingDeg: number,
  offsetMeters: number,
): LatLng => {
  const heading = (headingDeg * Math.PI) / 180;
  const latPerMeter = 1 / 111111;
  const lonPerMeter = 1 / (111111 * Math.cos((location.latitude * Math.PI) / 180));

  return {
    latitude: location.latitude + Math.cos(heading) * offsetMeters * latPerMeter,
    longitude: location.longitude + Math.sin(heading) * offsetMeters * lonPerMeter,
  };
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

const parseLatLng = (value: string): LatLng | null => {
  const [latRaw, lonRaw] = value.split(",");
  const latitude = Number(latRaw);
  const longitude = Number(lonRaw);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

export default function RideNavigationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuthStore((state: any) => state.token);
  const currentRider = useAuthStore((state: any) => state.rider);

  const {
    connect,
    setRideContext,
    clearRideContext,
    joinRoom,
    sendHeartbeat,
    upsertLocation,
    connected,
    inRoom,
    isJoining,
    session: liveSocketSession,
    presence,
    sessionEndedReason,
  } = useLiveSessionStore();

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [navigationRoute, setNavigationRoute] = useState<NavigationRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [topControlsHeight, setTopControlsHeight] = useState(0);

  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const lastCameraUpdateRef = useRef(0);

  const { data: ride, isLoading, isError, refetch } = useQuery({
    queryKey: ["ride", id],
    queryFn: () => fetchRideDetails(id!),
    enabled: Boolean(id),
  });

  const { data: liveSession, refetch: refetchLiveSession } = useQuery({
    queryKey: ["live-session", id],
    queryFn: () => fetchLiveSession(id!),
    enabled: Boolean(id),
    retry: false,
  });

  const startLiveMutation = useMutation({
    mutationFn: () => startLiveSessionReq(id!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ride", id] }),
        queryClient.invalidateQueries({ queryKey: ["live-session", id] }),
      ]);
      await refetchLiveSession();
      joinRoom(id!);
    },
    onError: () => {
      Alert.alert("Error", "Failed to start live session.");
    },
  });

  const endRideMutation = useMutation({
    mutationFn: () => endLiveSessionReq(id!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ride", id] }),
        queryClient.invalidateQueries({ queryKey: ["live-session", id] }),
      ]);
      await refetchLiveSession();
      router.replace(`/ride/${id}` as any);
    },
    onError: () => {
      Alert.alert("Error", "Failed to end ride.");
    },
  });

  useEffect(() => {
    if (!token || !id) {
      return;
    }

    connect(token);
    setRideContext(id);

    return () => {
      clearRideContext();
    };
  }, [clearRideContext, connect, id, setRideContext, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => {
      subscription.remove();
    };
  }, []);

  const rideStart = toCoordinate(ride?.start_point_geojson?.coordinates || null);
  const rideEnd = toCoordinate(ride?.end_point_geojson?.coordinates || null);

  const startKey = rideStart
    ? `${rideStart.latitude},${rideStart.longitude}`
    : "";
  const endKey = rideEnd ? `${rideEnd.latitude},${rideEnd.longitude}` : "";

  const waypointKey = useMemo(() => {
    if (!ride?.stops) {
      return "";
    }

    return ride.stops
      .filter((stop: any) => stop.status !== "rejected" && stop.location?.coordinates)
      .map(
        (stop: any) => `${stop.location.coordinates[1]},${stop.location.coordinates[0]}`,
      )
      .join("|");
  }, [ride?.stops]);

  const waypointCoords = useMemo(() => {
    if (!waypointKey) {
      return [];
    }

    return waypointKey
      .split("|")
      .map((segment: string) => parseLatLng(segment))
      .filter((value: LatLng | null): value is LatLng => Boolean(value));
  }, [waypointKey]);

  useEffect(() => {
    const start = parseLatLng(startKey);
    const end = parseLatLng(endKey);

    if (!start || !end) {
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      setRouteLoading(true);
      try {
        const route = await fetchNavigationRoute({
          origin: start,
          destination: end,
          waypoints: waypointCoords,
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        });

        if (!cancelled) {
          setNavigationRoute(route);
          setStepIndex(0);
        }
      } finally {
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    };

    void loadRoute();

    return () => {
      cancelled = true;
    };
  }, [endKey, startKey, waypointKey]);

  const liveStatus = liveSocketSession?.status || liveSession?.status || "not_started";

  useEffect(() => {
    const shouldJoin =
      Boolean(id) &&
      connected &&
      appState === "active" &&
      !inRoom &&
      !isJoining &&
      (liveStatus === "active" || liveStatus === "starting" || liveStatus === "paused");

    if (shouldJoin) {
      joinRoom(id!);
    }
  }, [appState, connected, id, inRoom, isJoining, joinRoom, liveStatus]);

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
    const canTrack =
      appState === "active" && (liveStatus === "active" || liveStatus === "starting");

    if (!canTrack) {
      return;
    }

    let closed = false;
    let locationSubscription: ExpoLocation.LocationSubscription | null = null;

    const startTracking = async () => {
      if (typeof window !== "undefined" && (global as any).document) {
        return;
      }

      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (closed || permission.status !== "granted") {
        return;
      }

      locationSubscription = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.Balanced,
          timeInterval: 4000,
          distanceInterval: 8,
        },
        (position) => {
          const nextLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          setCurrentLocation(nextLocation);

          if (
            typeof position.coords.heading === "number" &&
            Number.isFinite(position.coords.heading) &&
            position.coords.heading >= 0
          ) {
            setCurrentHeading(position.coords.heading);
          }

          if (inRoom) {
            upsertLocation({
              lon: position.coords.longitude,
              lat: position.coords.latitude,
              speed_kmh:
                typeof position.coords.speed === "number" &&
                Number.isFinite(position.coords.speed) &&
                position.coords.speed >= 0
                  ? position.coords.speed * 3.6
                  : undefined,
              heading_deg:
                typeof position.coords.heading === "number" &&
                Number.isFinite(position.coords.heading) &&
                position.coords.heading >= 0
                  ? position.coords.heading
                  : undefined,
              accuracy_m:
                typeof position.coords.accuracy === "number" &&
                Number.isFinite(position.coords.accuracy)
                  ? position.coords.accuracy
                  : undefined,
              captured_at: new Date(position.timestamp).toISOString(),
            });
          }
        },
      );
    };

    void startTracking();

    return () => {
      closed = true;
      locationSubscription?.remove();
    };
  }, [appState, inRoom, liveStatus, upsertLocation]);

  useEffect(() => {
    if (!mapRef.current || !currentLocation) {
      return;
    }

    const now = Date.now();
    if (now - lastCameraUpdateRef.current < 1200) {
      return;
    }

    const center = calculateForwardOffset(currentLocation, currentHeading, 55);

    mapRef.current.animateCamera(
      {
        center,
        heading: currentHeading,
        pitch: 50,
        zoom: 17,
      },
      { duration: 900 },
    );

    lastCameraUpdateRef.current = now;
  }, [currentHeading, currentLocation]);

  const navState: "NOT_STARTED" | "ACTIVE" | "COMPLETED" =
    ride?.status === "completed" || liveStatus === "ended"
      ? "COMPLETED"
      : liveStatus === "active" || liveStatus === "starting" || ride?.status === "active"
        ? "ACTIVE"
        : "NOT_STARTED";

  const steps = navigationRoute?.steps || [];

  useEffect(() => {
    if (!currentLocation || steps.length === 0 || stepIndex >= steps.length) {
      return;
    }

    const step = steps[stepIndex];
    const distanceToStepEnd = haversineMeters(currentLocation, step.end);

    if (distanceToStepEnd < 35 && stepIndex < steps.length - 1) {
      setStepIndex((value) => value + 1);
    }
  }, [currentLocation, stepIndex, steps]);

  const nextStep = steps[stepIndex];
  const distanceToNextTurnMeters =
    currentLocation && nextStep
      ? haversineMeters(currentLocation, nextStep.end)
      : nextStep?.distanceMeters || 0;

  const remainingDistanceMeters = useMemo(() => {
    if (!nextStep) {
      return navigationRoute?.totalDistanceMeters || 0;
    }

    const tail = steps
      .slice(stepIndex + 1)
      .reduce((sum, step) => sum + step.distanceMeters, 0);

    return Math.max(0, distanceToNextTurnMeters + tail);
  }, [distanceToNextTurnMeters, navigationRoute?.totalDistanceMeters, nextStep, stepIndex, steps]);

  const remainingDurationSeconds = useMemo(() => {
    if (!nextStep) {
      return navigationRoute?.totalDurationSeconds || 0;
    }

    const tail = steps
      .slice(stepIndex + 1)
      .reduce((sum, step) => sum + step.durationSeconds, 0);

    return Math.max(0, nextStep.durationSeconds + tail);
  }, [navigationRoute?.totalDurationSeconds, nextStep, stepIndex, steps]);

  const participants: RideParticipantView[] = useMemo(() => {
    if (!ride?.participants) {
      return [];
    }

    return ride.participants.map((participant: any) => ({
      riderId: participant.rider_id,
      displayName: participant.display_name,
      role: participant.role,
      isOnline: presence[participant.rider_id]?.isOnline ?? false,
    }));
  }, [presence, ride?.participants]);

  const isHost = ride?.captain_id === currentRider?.id;

  if (isLoading) {
    return (
      <SafeAreaView className='flex-1 items-center justify-center' style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError || !ride || !rideStart || !rideEnd) {
    return (
      <SafeAreaView className='flex-1 items-center justify-center px-6' style={{ backgroundColor: colors.bg }}>
        <Text className='text-center font-semibold' style={{ color: colors.text }}>
          Failed to load navigation.
        </Text>
        <TouchableOpacity
          className='mt-4 px-4 py-2 rounded-xl'
          onPress={() => refetch()}
          style={{ backgroundColor: colors.primary }}
        >
          <Text className='text-white font-semibold'>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        userInterfaceStyle='dark'
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{
          latitude: rideStart.latitude,
          longitude: rideStart.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
      >
        <Marker coordinate={rideStart} title='Start' pinColor='#22c55e' />
        <Marker coordinate={rideEnd} title='Destination' pinColor='#ef4444' />

        {navigationRoute?.polyline?.length ? (
          <Polyline
            coordinates={navigationRoute.polyline}
            strokeColor={colors.primary}
            strokeWidth={5}
          />
        ) : null}

        {currentLocation ? (
          <Marker
            coordinate={currentLocation}
            title='You'
            pinColor='#2563eb'
          />
        ) : null}
      </MapView>

      <SafeAreaView
        className='absolute top-0 left-0 right-0 px-4 pt-2'
        edges={["top"]}
        style={{ zIndex: 70, elevation: 70 }}
        onLayout={(event) => {
          setTopControlsHeight(Math.round(event.nativeEvent.layout.height));
        }}
      >
        <View className='flex-row items-center justify-between'>
          <TouchableOpacity
            onPress={() => router.replace(`/ride/${id}` as any)}
            className='w-10 h-10 rounded-full items-center justify-center'
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <ChevronLeft color='white' size={22} />
          </TouchableOpacity>

          {isHost && navState === "NOT_STARTED" ? (
            <TouchableOpacity
              onPress={() => startLiveMutation.mutate()}
              disabled={startLiveMutation.isPending}
              className='px-4 py-2 rounded-full'
              style={{ backgroundColor: colors.primary }}
            >
              <Text className='text-white font-semibold'>
                {startLiveMutation.isPending ? "Starting..." : "Start Ride"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
        </View>
      </SafeAreaView>

      <NavigationInstructionOverlay
        instruction={
          navState === "COMPLETED"
            ? "Ride completed"
            : nextStep?.instruction || "Head to the highlighted route"
        }
        distanceToTurnLabel={formatDistance(distanceToNextTurnMeters)}
        etaLabel={formatEta(remainingDurationSeconds)}
        remainingLabel={formatDistance(remainingDistanceMeters)}
        statusLabel={navState}
        topOffset={topControlsHeight + 8}
      />

      {routeLoading ? (
        <View className='absolute top-28 self-center px-3 py-2 rounded-full' style={{ backgroundColor: colors.surface }}>
          <Text style={{ color: colors.textMuted }}>Loading route...</Text>
        </View>
      ) : null}

      {sessionEndedReason && navState === "COMPLETED" ? (
        <View className='absolute top-28 self-center px-4 py-2 rounded-full' style={{ backgroundColor: colors.danger }}>
          <Text className='text-white text-xs'>Ended: {sessionEndedReason}</Text>
        </View>
      ) : null}

      <NavigationBottomSheet
        rideName={ride.title}
        participants={participants}
        isHost={isHost}
        canEndRide={navState === "ACTIVE"}
        onEndRide={() => endRideMutation.mutate()}
        ending={endRideMutation.isPending}
      />
    </View>
  );
}
