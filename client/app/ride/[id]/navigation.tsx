import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { LocateFixed } from "lucide-react-native";
import MapView, { PROVIDER_GOOGLE } from "../../../src/components/MapWrapper";
import { useAuthStore } from "../../../src/store/authStore";
import { useTheme } from "../../../src/theme/ThemeContext";
import { ManeuverBanner } from "../../../src/features/navigation/components/ManeuverBanner";
import {
  NavigationBottomSheet,
  navigationSheetCollapsedHeight,
  type TripBarAction,
} from "../../../src/features/navigation/components/NavigationBottomSheet";
import { NavigationRouteLayer } from "../../../src/features/navigation/components/NavigationRouteLayer";
import { PeerMarkers } from "../../../src/features/navigation/components/PeerMarkers";
import { RiderPuck } from "../../../src/features/navigation/components/RiderPuck";
import { WaypointMarker } from "../../../src/features/navigation/components/WaypointMarker";
import {
  formatArrivalTime,
  formatDistance,
  formatDuration,
} from "../../../src/features/navigation/core/format";
import { waypointLabel } from "../../../src/features/navigation/core/guidance";
import { buildTripPlan, type TripWaypoint } from "../../../src/features/navigation/core/tripPlan";
import { useAppIsActive } from "../../../src/features/navigation/hooks/useAppIsActive";
import { useLiveLeg } from "../../../src/features/navigation/hooks/useLiveLeg";
import { useNavigationCamera } from "../../../src/features/navigation/hooks/useNavigationCamera";
import { useNavigationFix } from "../../../src/features/navigation/hooks/useNavigationFix";
import { useNavigationMapTheme } from "../../../src/features/navigation/hooks/useNavigationMapTheme";
import { useNavigationSession } from "../../../src/features/navigation/hooks/useNavigationSession";
import { usePlannedRoute } from "../../../src/features/navigation/hooks/usePlannedRoute";
import { useSimulatedNavigationFix } from "../../../src/features/navigation/hooks/useSimulatedNavigationFix";
import { useRideLiveSession } from "../../../src/features/navigation/hooks/useRideLiveSession";
import { useRideParticipants } from "../../../src/features/navigation/hooks/useRideParticipants";
import { useScreenAwake } from "../../../src/features/navigation/hooks/useScreenAwake";
import { useTripProgress } from "../../../src/features/navigation/hooks/useTripProgress";
import { useWaypointReports } from "../../../src/features/navigation/hooks/useWaypointReports";
import type {
  LatLng,
  NavigationFix,
  RideParticipantView,
} from "../../../src/features/navigation/types/navigation";

const KEEP_AWAKE_TAG = "ride-navigation-fullscreen";
/** Banner height assumed for the map padding until the real one is measured. */
const ESTIMATED_BANNER_HEIGHT = 120;
const INITIAL_REGION_DELTA = 0.08;
const RECENTER_GAP = 12;
const KMH_PER_MPS = 3.6;
/** Tighter than the default focus zoom so stops metres apart are unambiguous. */
const WAYPOINT_FOCUS_ZOOM = 18;

export default function RideNavigationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { id, simulate } = useLocalSearchParams<{ id: string; simulate?: string }>();
  const isSimulated = __DEV__ && simulate === "1";
  const currentRiderId = useAuthStore((state: any) => state.rider?.id) as string | undefined;

  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const sheetCollapsedHeight = navigationSheetCollapsedHeight(insets.bottom);
  const [bannerBottom, setBannerBottom] = useState(insets.top + ESTIMATED_BANNER_HEIGHT);
  const [sheetHeight, setSheetHeight] = useState(sheetCollapsedHeight);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [focusedWaypointId, setFocusedWaypointId] = useState<string | null>(null);

  const rideDetailHref = `/ride/${id}` as Href;
  const exitNavigation = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(rideDetailHref);
  }, [rideDetailHref, router]);

  const live = useRideLiveSession({
    rideId: id,
    isAppActive,
    onRideEnded: () => router.replace(rideDetailHref),
  });
  useScreenAwake(isFocused && isAppActive, KEEP_AWAKE_TAG);

  const { inRoom, upsertLocation } = live;
  const publishPosition = useCallback(
    (fix: NavigationFix) => {
      if (!inRoom) return;
      upsertLocation({
        lon: fix.coordinate.longitude,
        lat: fix.coordinate.latitude,
        speed_kmh: fix.speedMps !== null ? fix.speedMps * KMH_PER_MPS : undefined,
        heading_deg: fix.headingDegrees ?? undefined,
        accuracy_m: fix.accuracyMeters ?? undefined,
        captured_at: new Date(fix.timestamp).toISOString(),
      });
    },
    [inRoom, upsertLocation],
  );

  // The ride as one trip: start, approved stops in planned order, destination.
  const waypoints = useMemo(() => buildTripPlan(live.ride), [live.ride]);
  const plannedRoute = usePlannedRoute(waypoints);

  const liveFix = useNavigationFix({
    isEnabled: !isSimulated && isAppActive && live.isTracking,
    onPosition: publishPosition,
  });
  // Dev-only: replays a synthetic ride along the planned route instead of
  // reading real GPS, so navigation can be watched end-to-end without riding.
  // Enabled with `?simulate=1` on this screen; never active outside __DEV__.
  // Simulated positions are deliberately not published to the live session:
  // they would be stored as real track samples, and a track fed by both the
  // simulation and the rider's own GPS reads as constant teleporting.
  const simulatedFix = useSimulatedNavigationFix({
    isEnabled: isSimulated,
    polyline: plannedRoute.route?.polyline ?? null,
  });
  const { fix, headingDegrees, isPermissionDenied } = isSimulated ? simulatedFix : liveFix;

  // The rider stays on the map for the whole ride, even once the last waypoint
  // is reached and tracking stops — the ride is over when the ride is ended,
  // not when the route runs out.
  const [lastKnownFix, setLastKnownFix] = useState<NavigationFix | null>(null);
  useEffect(() => {
    if (fix) setLastKnownFix(fix);
  }, [fix]);
  const puckFix = fix ?? lastKnownFix;

  const { session, skipTarget } = useNavigationSession({
    rideId: id,
    waypoints,
    tripGeometry: plannedRoute.tripGeometry,
    isPlannedRouteSettled: plannedRoute.isSettled,
    fix,
  });

  // Arrival times go to the server so the ride history can show them.
  useWaypointReports({
    rideId: id,
    session,
    waypoints,
    inRoom: live.inRoom,
    report: live.reportWaypointReached,
  });

  // Only the waypoint being ridden to gets a live route; waiting at a stop, there is none.
  const targetWaypoint =
    session?.isPlaced && session.phase === "NAVIGATING"
      ? waypoints?.[session.targetIndex] ?? null
      : null;

  const liveLeg = useLiveLeg({ target: targetWaypoint, fix, isActive: isAppActive });

  const progress = useTripProgress({
    waypoints,
    session,
    plannedLegs: plannedRoute.legs,
    isPlannedRouteSettled: plannedRoute.isSettled,
    liveLeg,
    rideState: live.rideState,
    fix,
  });

  const mapTheme = useNavigationMapTheme();
  const camera = useNavigationCamera({
    mapRef,
    fix,
    headingDegrees,
    topInset: bannerBottom,
    bottomInset: sheetCollapsedHeight,
  });

  const { participants, peers } = useRideParticipants({
    ride: live.ride,
    presence: live.presence,
    locations: live.locations,
    currentRiderId,
  });

  const overviewCoordinates = (): LatLng[] => {
    const route = [
      ...progress.currentLegLine,
      ...progress.laterLegs.flatMap((leg) => leg.polyline),
    ];
    const framed = route.length > 1 ? route : (waypoints ?? []).map((w) => w.coordinate);
    return fix ? [fix.coordinate, ...framed] : framed;
  };

  // With no GPS yet — a preview, or before the first fix — frame the whole route once.
  const { showOverview, follow } = camera;
  const plannedPolyline = plannedRoute.route?.polyline;
  const hasFramedRouteRef = useRef(false);
  useEffect(() => {
    if (hasFramedRouteRef.current || fix || !plannedPolyline?.length) return;
    hasFramedRouteRef.current = true;
    showOverview(plannedPolyline);
  }, [fix, plannedPolyline, showOverview]);

  // The first fix after that automatic framing switches to following the rider.
  const hasFix = fix !== null;
  useEffect(() => {
    if (hasFix && hasFramedRouteRef.current) follow();
  }, [follow, hasFix]);

  const recenter = () => {
    setFocusedParticipantId(null);
    setFocusedWaypointId(null);
    if (fix) camera.follow();
    else camera.showOverview(overviewCoordinates());
  };

  const toggleOverview = () => {
    if (camera.mode === "overview") recenter();
    else camera.showOverview(overviewCoordinates());
  };

  const focusParticipant = (participant: RideParticipantView) => {
    setFocusedWaypointId(null);
    if (participant.riderId === currentRiderId) {
      if (!fix) {
        Alert.alert("Location unavailable", "Your live location is not available yet.");
        return;
      }
      setFocusedParticipantId(participant.riderId);
      camera.focusOn(fix.coordinate, headingDegrees ?? 0);
      return;
    }

    const location = live.locations[participant.riderId];
    if (!location) {
      Alert.alert(
        "Location unavailable",
        `${participant.displayName}'s live location is not available yet.`,
      );
      return;
    }

    setFocusedParticipantId(participant.riderId);
    camera.focusOn({ latitude: location.lat, longitude: location.lon }, location.headingDeg ?? 0);
  };

  const focusWaypoint = (waypoint: TripWaypoint) => {
    setFocusedParticipantId(null);
    setFocusedWaypointId(waypoint.id);
    // Flat and tighter than the self/peer focus view: stops can sit only
    // metres apart, and a top-down view (plus the marker's halo) makes which
    // one was tapped unambiguous in a way a tilted 3D view would not.
    camera.focusOn(waypoint.coordinate, 0, { zoom: WAYPOINT_FOCUS_ZOOM, pitch: 0 });
  };

  const confirmSkip = (target: TripWaypoint) => {
    Alert.alert(`Skip ${waypointLabel(target)}?`, "Navigation will head to the next waypoint.", [
      { text: "Cancel", style: "cancel" },
      { text: "Skip", style: "destructive", onPress: skipTarget },
    ]);
  };

  if (live.isLoading) {
    return (
      <SafeAreaView className='flex-1 items-center justify-center' style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (live.isError || !live.ride || !waypoints) {
    return (
      <SafeAreaView className='flex-1 items-center justify-center px-6' style={{ backgroundColor: colors.bg }}>
        <Text className='text-center font-semibold' style={{ color: colors.text }}>
          Failed to load navigation.
        </Text>
        <TouchableOpacity
          accessibilityRole='button'
          className='mt-4 px-4 py-2 rounded-xl'
          onPress={live.refetch}
          style={{ backgroundColor: colors.primary }}
        >
          <Text className='text-white font-semibold'>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const rideStart = waypoints[0]!.coordinate;
  const isHost = live.ride.captain_id === currentRiderId;
  const isFinished = live.rideState === "COMPLETED" || session?.phase === "FINISHED";

  const tripAction = ((): TripBarAction | null => {
    if (isHost && live.rideState === "NOT_STARTED") {
      return {
        label: live.isStarting ? "Starting…" : "Start ride",
        onPress: live.startRide,
        isBusy: live.isStarting,
      };
    }
    if (live.rideState !== "ACTIVE" || !session?.isPlaced) return null;
    if (session.phase === "AT_WAYPOINT") return { label: "Continue", onPress: skipTarget };

    const target = waypoints[session.targetIndex];
    if (session.phase !== "NAVIGATING" || !target || target.kind === "destination") return null;
    return {
      label: target.kind === "start" ? "Skip start" : "Skip stop",
      onPress: () => confirmSkip(target),
    };
  })();

  const { summary } = progress;
  const durationLabel = isFinished
    ? "Arrived"
    : summary.toNextSeconds === null
      ? "--"
      : formatDuration(summary.toNextSeconds);
  const detailLabel = isFinished
    ? live.ride.title
    : [
        summary.toNextMeters === null ? null : formatDistance(summary.toNextMeters),
        summary.nextLabel ? `to ${summary.nextLabel}` : null,
        summary.totalSeconds === null
          ? null
          : `arrive ${formatArrivalTime(summary.totalSeconds, Date.now())}`,
      ]
        .filter(Boolean)
        .join(" · ");

  const statusLabel = isPermissionDenied
    ? "Location is off — allow it to navigate"
    : progress.routeStatusLabel ?? (progress.isRouteLoading ? "Loading route…" : null);
  const alertLabel = isSimulated
    ? "SIMULATED GPS — dev only"
    : live.sessionEndedReason && live.rideState === "COMPLETED"
      ? `Ended: ${live.sessionEndedReason}`
      : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        userInterfaceStyle={mapTheme.isNight ? "dark" : "light"}
        customMapStyle={mapTheme.mapStyle}
        mapPadding={camera.mapPadding}
        rotateEnabled
        pitchEnabled
        toolbarEnabled={false}
        onRegionChange={camera.onRegionChange}
        onPanDrag={camera.onPanDrag}
        initialRegion={{
          ...rideStart,
          latitudeDelta: INITIAL_REGION_DELTA,
          longitudeDelta: INITIAL_REGION_DELTA,
        }}
      >
        {waypoints.map((waypoint, index) => (
          <WaypointMarker
            key={waypoint.id}
            waypoint={waypoint}
            status={progress.waypointStatuses[index] ?? "upcoming"}
            isFocused={waypoint.id === focusedWaypointId}
            colors={mapTheme.colors}
          />
        ))}

        <NavigationRouteLayer
          currentLine={progress.currentLegLine}
          laterLegs={progress.laterLegs}
          colors={mapTheme.colors}
        />

        <PeerMarkers
          peers={peers}
          focusedRiderId={focusedParticipantId}
          color={mapTheme.colors.peer}
          focusedColor={colors.primary}
        />

        {puckFix ? (
          <RiderPuck
            coordinate={puckFix.coordinate}
            headingDegrees={headingDegrees ?? puckFix.headingDegrees ?? 0}
          />
        ) : null}
      </MapView>

      <ManeuverBanner
        guidance={progress.guidance}
        colors={mapTheme.colors}
        statusLabel={statusLabel}
        alertLabel={alertLabel}
        onBottomChange={(bottom) =>
          setBannerBottom((previous) => (Math.abs(previous - bottom) > 2 ? bottom : previous))
        }
      />

      {camera.mode !== "follow" ? (
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel={fix ? "Re-center on your position" : "Show the whole route"}
          onPress={recenter}
          style={[
            styles.recenter,
            {
              bottom: sheetHeight + RECENTER_GAP,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <LocateFixed color={colors.primary} size={18} />
          <Text style={[styles.recenterText, { color: colors.text }]}>
            {fix ? "Re-center" : "Show route"}
          </Text>
        </TouchableOpacity>
      ) : null}

      <NavigationBottomSheet
        rideName={live.ride.title}
        participants={participants}
        isHost={isHost}
        canEndRide={live.rideState === "ACTIVE"}
        onEndRide={live.endRide}
        ending={live.isEnding}
        focusedParticipantId={focusedParticipantId}
        onParticipantPress={focusParticipant}
        waypoints={waypoints}
        waypointStatuses={progress.waypointStatuses}
        focusedWaypointId={focusedWaypointId}
        onWaypointPress={focusWaypoint}
        onSnapHeightChange={setSheetHeight}
        durationLabel={durationLabel}
        detailLabel={detailLabel}
        onExit={exitNavigation}
        onOverview={toggleOverview}
        isOverview={camera.mode === "overview"}
        action={tripAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  recenter: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    zIndex: 65,
    elevation: 65,
  },
  recenterText: {
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 8,
  },
});
