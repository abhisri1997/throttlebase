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
import {
  NAVIGATION_SHEET_COLLAPSED_HEIGHT,
  NavigationBottomSheet,
} from "../../../src/features/navigation/components/NavigationBottomSheet";
import { NavigationInstructionOverlay } from "../../../src/features/navigation/components/NavigationInstructionOverlay";
import {
  buildCanonicalRideRouteInput,
  fetchNavigationRoute,
  haversineMeters,
} from "../../../src/features/navigation/services/navigationRouteService";
import type {
  LatLng,
  NavigationRoute,
  RideParticipantView,
} from "../../../src/features/navigation/types/navigation";
import { Motorbike, ChevronLeft, Navigation } from "lucide-react-native";

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

const USER_FOLLOW_ZOOM = 19;

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
    locations,
    sessionEndedReason,
  } = useLiveSessionStore();

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [navigationRoute, setNavigationRoute] = useState<NavigationRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [topControlsHeight, setTopControlsHeight] = useState(0);
  const [instructionOverlayHeight, setInstructionOverlayHeight] = useState(0);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(
    NAVIGATION_SHEET_COLLAPSED_HEIGHT,
  );

  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const lastCameraUpdateRef = useRef(0);
  const lastRouteRefreshAtRef = useRef(0);
  const lastRouteOriginRef = useRef<LatLng | null>(null);
  const lastRouteUsedDeviceOriginRef = useRef(false);
  const currentLocationRef = useRef<LatLng | null>(currentLocation);
  currentLocationRef.current = currentLocation;
  const fetchRouteNowRef = useRef<(() => Promise<void>) | null>(null);
  const appStateRef = useRef<AppStateStatus>(appState);
  appStateRef.current = appState;

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

  // Includes currentLocation as origin for accurate routing — used by aheadPolyline.
  const canonicalRoute = useMemo(
    () =>
      buildCanonicalRideRouteInput({
        origin: currentLocation,
        start: rideStart,
        stops: approvedStopCoords,
        destination: rideEnd,
      }),
    [approvedStopCoords, currentLocation, rideEnd, rideStart],
  );

  // Ref so effects can read latest canonical route without adding it to deps.
  const canonicalRouteRef = useRef(canonicalRoute);
  canonicalRouteRef.current = canonicalRoute;

  // Key based only on static waypoints — GPS updates do NOT change this.
  // Only changes when the ride's start/stops/destination change.
  const destinationKey = useMemo(() => {
    if (!rideStart || !rideEnd) {
      return "";
    }
    return [rideStart, ...approvedStopCoords, rideEnd]
      .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
      .join("|");
  }, [approvedStopCoords, rideEnd, rideStart]);

  // Fetch route on mount (destinationKey change) and re-fetch when
  // 25s elapsed OR user moved 40m — both checked via interval reading refs.
  // currentLocation is NEVER a dep — reads via canonicalRouteRef to avoid
  // the cancelled-fetch loop caused by cleanup on every location update.
  useEffect(() => {
    if (!destinationKey) {
      setNavigationRoute(null);
      return;
    }

    let cancelled = false;
    let isFetching = false;

    const doFetch = async () => {
      if (isFetching || cancelled) {
        return;
      }
      if (appStateRef.current !== "active") {
        return;
      }
      const cr = canonicalRouteRef.current;
      if (!cr) {
        return;
      }
      isFetching = true;
      setRouteLoading(true);
      try {
        const route = await fetchNavigationRoute({
          origin: cr.origin,
          destination: cr.destination,
          waypoints: cr.waypoints,
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        });
        if (!cancelled) {
          if (__DEV__) {
            console.log(
              "[navigation] route source:",
              route.source,
              "polyline pts:",
              route.polyline.length,
            );
          }
          setNavigationRoute(route);
          setStepIndex(0);
          lastRouteOriginRef.current = cr.origin;
          lastRouteUsedDeviceOriginRef.current = Boolean(currentLocationRef.current);
          lastRouteRefreshAtRef.current = Date.now();
        }
      } finally {
        isFetching = false;
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    };

    fetchRouteNowRef.current = doFetch;

    // Initial fetch: prefer live GPS-origin route when available.
    // If GPS isn't ready yet, wait a short grace window before falling back
    // to start-point-origin fetch to avoid immediate wrong-route + delayed reroute.
    let initialFetchTimer: ReturnType<typeof setTimeout> | null = null;
    if (currentLocationRef.current) {
      void doFetch();
    } else {
      initialFetchTimer = setTimeout(() => {
        void doFetch();
      }, 1200);
    }

    // Poll every 5s: re-fetch if 25s elapsed OR moved 40m from last origin
    const timer = setInterval(() => {
      if (appStateRef.current !== "active") {
        return;
      }

      const lastOrigin = lastRouteOriginRef.current;
      const currentOrigin = canonicalRouteRef.current?.origin ?? null;
      const movedMeters =
        lastOrigin && currentOrigin ? haversineMeters(lastOrigin, currentOrigin) : 0;
      const elapsed = Date.now() - lastRouteRefreshAtRef.current;
      const movedEnough = movedMeters >= 40;
      const movementCooldownElapsed = elapsed >= 12000;
      const periodicRefreshDue = elapsed >= 25000;

      if (periodicRefreshDue || (movedEnough && movementCooldownElapsed)) {
        void doFetch();
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (initialFetchTimer) {
        clearTimeout(initialFetchTimer);
      }
      fetchRouteNowRef.current = null;
    };
  }, [destinationKey]);

  // As soon as we get first device GPS fix, fetch route immediately from live origin.
  // Without this, we may wait for movement cooldown and show route only after several seconds.
  useEffect(() => {
    if (!currentLocation) {
      return;
    }
    if (lastRouteUsedDeviceOriginRef.current) {
      return;
    }
    void fetchRouteNowRef.current?.();
  }, [currentLocation]);

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

    const applyPosition = (position: ExpoLocation.LocationObject) => {
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
    };

    const startTracking = async () => {
      if (typeof window !== "undefined" && (globalThis as any).document) {
        return;
      }

      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (closed || permission.status !== "granted") {
        return;
      }

      // Seed location immediately when possible to avoid delayed first reroute.
      try {
        const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
        if (!closed && lastKnown?.coords) {
          applyPosition(lastKnown as ExpoLocation.LocationObject);
        }
      } catch {
        // noop: watchPositionAsync below will still stream updates.
      }

      try {
        const current = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        if (!closed && current?.coords) {
          applyPosition(current);
        }
      } catch {
        // noop: watchPositionAsync below will still stream updates.
      }

      locationSubscription = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.Balanced,
          timeInterval: 4000,
          distanceInterval: 8,
        },
        (position) => {
          applyPosition(position);
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
    if (!mapRef.current || !currentLocation || focusedParticipantId) {
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
        zoom: USER_FOLLOW_ZOOM,
      },
      { duration: 900 },
    );

    lastCameraUpdateRef.current = now;
  }, [currentHeading, currentLocation, focusedParticipantId]);

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

  const peerLocationMarkers = useMemo(() => {
    if (!ride?.participants) {
      return [];
    }

    const displayNameByRiderId = new Map<string, string>();
    for (const participant of ride.participants) {
      displayNameByRiderId.set(
        participant.rider_id,
        participant.display_name || "Rider",
      );
    }

    return Object.values(locations)
      .filter((location) => location.riderId !== currentRider?.id)
      .filter((location) => presence[location.riderId]?.isOnline !== false)
      .map((location) => ({
        ...location,
        displayName: displayNameByRiderId.get(location.riderId) || "Rider",
      }));
  }, [currentRider?.id, locations, presence, ride?.participants]);

  const aheadPolyline = useMemo(() => {
    const fullPolyline = navigationRoute?.polyline;
    if (!fullPolyline?.length || !currentLocation) {
      return fullPolyline ?? [];
    }

    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < fullPolyline.length; i++) {
      const dist = haversineMeters(currentLocation, fullPolyline[i]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }

    return fullPolyline.slice(nearestIndex);
  }, [currentLocation, navigationRoute?.polyline]);

  const isHost = ride?.captain_id === currentRider?.id;
  const onlineParticipants = participants.filter((participant) => participant.isOnline).length;
  const peerOnlineCount = peerLocationMarkers.length;
  const statusBannerTop = topControlsHeight + instructionOverlayHeight + 14;

  const focusParticipantOnMap = (participant: RideParticipantView) => {
    if (!mapRef.current) {
      return;
    }

    if (participant.riderId === currentRider?.id) {
      if (!currentLocation) {
        Alert.alert("Location unavailable", "Your live location is not available yet.");
        return;
      }

      setFocusedParticipantId(participant.riderId);
      mapRef.current.animateCamera(
        {
          center: currentLocation,
          heading: currentHeading,
          pitch: 42,
          zoom: 16,
        },
        { duration: 650 },
      );
      lastCameraUpdateRef.current = Date.now();
      return;
    }

    const participantLocation = locations[participant.riderId];
    if (!participantLocation) {
      Alert.alert(
        "Location unavailable",
        `${participant.displayName}'s live location is not available yet.`,
      );
      return;
    }

    setFocusedParticipantId(participant.riderId);
    mapRef.current.animateCamera(
      {
        center: {
          latitude: participantLocation.lat,
          longitude: participantLocation.lon,
        },
        heading: participantLocation.headingDeg ?? 0,
        pitch: 42,
        zoom: 16,
      },
      { duration: 650 },
    );
    lastCameraUpdateRef.current = Date.now();
  };

  const recenterMap = () => {
    if (!mapRef.current) {
      return;
    }

    setFocusedParticipantId(null);

    if (currentLocation) {
      const center = calculateForwardOffset(currentLocation, currentHeading, 55);
      mapRef.current.animateCamera(
        {
          center,
          heading: currentHeading,
          pitch: 50,
          zoom: USER_FOLLOW_ZOOM,
        },
        { duration: 650 },
      );
      return;
    }

    if (!rideStart) {
      return;
    }

    mapRef.current.animateCamera(
      {
        center: rideStart,
        heading: 0,
        pitch: 0,
        zoom: 14,
      },
      { duration: 650 },
    );
  };

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

        {approvedStopCoords.map((waypoint: LatLng, index: number) => (
          <Marker
            key={`${waypoint.latitude},${waypoint.longitude},${index}`}
            coordinate={waypoint}
            title={`Stop ${index + 1}`}
            pinColor='#f59e0b'
          />
        ))}

        {aheadPolyline.length > 1 ? (
          <Polyline
            coordinates={aheadPolyline}
            strokeColor={colors.primary}
            strokeWidth={5}
          />
        ) : null}

        {peerLocationMarkers.map((marker) => (
          <Marker
            key={`${marker.riderId}:${marker.capturedAt}`}
            coordinate={{
              latitude: marker.lat,
              longitude: marker.lon,
            }}
            title={marker.displayName}
            description={
              marker.speedKmh == null
                ? "Live rider"
                : `${marker.speedKmh.toFixed(1)} km/h`
            }
          >
            <View
              style={{
                backgroundColor: focusedParticipantId === marker.riderId ? colors.primary : '#f59e0b',
                borderRadius: 20,
                padding: 6,
              }}
            >
              <Motorbike color='white' size={16} />
            </View>
          </Marker>
        ))}

        {currentLocation ? (
          <Marker coordinate={currentLocation} title='You'>
            <View
              style={{
                backgroundColor: '#2563eb',
                borderRadius: 20,
                padding: 6,
              }}
            >
              <Motorbike color='white' size={16} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      <SafeAreaView
        className='absolute top-0 left-0 right-0 px-4 pt-2'
        edges={["top"]}
        style={{ zIndex: 70, elevation: 70 }}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setTopControlsHeight((previous) =>
            Math.abs(previous - nextHeight) > 2 ? nextHeight : previous,
          );
        }}
      >
        <View className='flex-row items-center justify-between'>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace(`/ride/${id}` as any);
              }
            }}
            className='h-11 rounded-full flex-row items-center justify-center px-4'
            style={{ backgroundColor: "rgba(15,23,42,0.74)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          >
            <ChevronLeft color='white' size={22} />
            <Text className='ml-1 text-sm font-semibold text-white'>Exit</Text>
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
            <View
              className='rounded-2xl px-3 py-2'
              style={{ backgroundColor: "rgba(15,23,42,0.74)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
            >
              <Text className='text-xs font-semibold text-white'>
                {navState === "ACTIVE"
                  ? `${onlineParticipants}/${participants.length} online`
                  : navState === "COMPLETED"
                    ? "Ride ended"
                    : "Route preview"}
              </Text>

              {navState === "ACTIVE" ? (
                <View className='mt-1 flex-row items-center'>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: "#2563eb",
                    }}
                  />
                  <Text className='ml-1 text-[10px]' style={{ color: "rgba(255,255,255,0.82)" }}>
                    You
                  </Text>

                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: "#f59e0b",
                      marginLeft: 8,
                    }}
                  />
                  <Text className='ml-1 text-[10px]' style={{ color: "rgba(255,255,255,0.82)" }}>
                    Peers {peerOnlineCount}
                  </Text>
                </View>
              ) : null}
            </View>
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
        onMeasuredHeight={(height) => {
          setInstructionOverlayHeight((previous) =>
            Math.abs(previous - height) > 2 ? height : previous,
          );
        }}
      />

      {routeLoading || (sessionEndedReason && navState === "COMPLETED") ? (
        <View
          className='absolute left-0 right-0 items-center px-4'
          style={{ top: statusBannerTop, zIndex: 65, elevation: 65 }}
        >
          {routeLoading ? (
            <View className='mb-2 rounded-full px-3 py-2' style={{ backgroundColor: colors.surface }}>
              <Text style={{ color: colors.textMuted }}>Loading route...</Text>
            </View>
          ) : null}

          {sessionEndedReason && navState === "COMPLETED" ? (
            <View className='rounded-full px-4 py-2' style={{ backgroundColor: colors.danger }}>
              <Text className='text-white text-xs'>Ended: {sessionEndedReason}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          position: "absolute",
          right: 16,
          bottom: bottomSheetHeight + 12,
          zIndex: 65,
          elevation: 65,
        }}
      >
        <TouchableOpacity
          onPress={recenterMap}
          className='h-12 w-12 items-center justify-center rounded-full'
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Navigation color={colors.text} size={20} />
        </TouchableOpacity>
      </View>

      <NavigationBottomSheet
        rideName={ride.title}
        participants={participants}
        isHost={isHost}
        canEndRide={navState === "ACTIVE"}
        onEndRide={() => endRideMutation.mutate()}
        ending={endRideMutation.isPending}
        focusedParticipantId={focusedParticipantId}
        onParticipantPress={focusParticipantOnMap}
        onSnapHeightChange={(height) => {
          setBottomSheetHeight(height);
        }}
      />
    </View>
  );
}
