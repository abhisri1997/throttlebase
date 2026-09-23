import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { LocateFixed } from "lucide-react-native";
import MapView, { PROVIDER_GOOGLE } from "../../../src/components/MapWrapper";
import { useCurrentRider } from "../../../src/services/useCurrentRider";
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
import {
  groupTargetIndex,
  shouldOfferCatchUp,
} from "../../../src/features/navigation/core/lateJoin";
import {
  suggestRegroupPoint,
  type RegroupCandidate,
  type RegroupSuggestion,
} from "../../../src/features/navigation/core/regroup";
import { projectOntoPolyline } from "../../../src/features/navigation/core/geometry";
import { fetchStopSuggestions } from "../../../src/features/rides/api/stopSuggestions";
import type { StopSuggestion } from "../../../src/features/rides/types/stops";
import { apiClient } from "../../../src/api/client";
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
/**
 * How long to wait for the crew's live positions before guiding a rider who
 * has opened navigation on an already-running ride. Their own first fix
 * arrives long before the first `location:broadcast`, and placing them in
 * that gap would set them off from the start before anyone could ask.
 */
const GROUP_POSITION_GRACE_MS = 5_000;
/** Alternatives offered to a leader who would rather regroup somewhere else. */
const MAX_REGROUP_ALTERNATIVES = 3;

export default function RideNavigationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { id, simulate } = useLocalSearchParams<{ id: string; simulate?: string }>();
  const isSimulated = __DEV__ && simulate === "1";
  const currentRiderId = useCurrentRider().riderId as string | undefined;

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
    (fix: NavigationFix, isSimulatedFix = false) => {
      if (!inRoom) return;
      upsertLocation({
        lon: fix.coordinate.longitude,
        lat: fix.coordinate.latitude,
        speed_kmh: fix.speedMps !== null ? fix.speedMps * KMH_PER_MPS : undefined,
        heading_deg: fix.headingDegrees ?? undefined,
        accuracy_m: fix.accuracyMeters ?? undefined,
        captured_at: new Date(fix.timestamp).toISOString(),
        ...(isSimulatedFix ? { simulated: true } : {}),
      });
    },
    [inRoom, upsertLocation],
  );

  const publishSimulatedPosition = useCallback(
    (fix: NavigationFix) => publishPosition(fix, true),
    [publishPosition],
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
    // Shared with the crew so peer markers move during a simulated ride; the
    // server is told these are simulated and keeps them out of the track.
    onPosition: publishSimulatedPosition,
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

  const crewPositions = useMemo(
    () =>
      Object.values(live.locations)
        .filter((location) => location.riderId !== currentRiderId)
        .map((location) => ({ latitude: location.lat, longitude: location.lon })),
    [currentRiderId, live.locations],
  );

  // Which waypoint the group is heading to, for placing a late rider.
  const groupIndex = useMemo(() => {
    if (!plannedRoute.tripGeometry) return 0;
    return groupTargetIndex(crewPositions, plannedRoute.tripGeometry);
  }, [crewPositions, plannedRoute.tripGeometry]);

  /**
   * How far along the route the rider furthest ahead actually is.
   *
   * Deliberately not the distance of the waypoint they are heading to: on a
   * ride whose next waypoint is the destination that would read as the end of
   * the route, and nothing can be found beyond it, so no regroup point would
   * ever be offered.
   */
  const groupAlongMeters = useMemo(() => {
    const trip = plannedRoute.tripGeometry;
    if (!trip) return 0;

    return crewPositions.reduce((furthest, position) => {
      const projected = projectOntoPolyline(position, trip.polyline, trip.cumulative);
      return projected
        ? Math.max(furthest, projected.distanceAlongMeters)
        : furthest;
    }, 0);
  }, [crewPositions, plannedRoute.tripGeometry]);

  // Nothing is known about where the crew is until their first broadcast, so
  // guidance holds briefly rather than committing the rider to the start.
  const [isGraceOver, setIsGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsGraceOver(true), GROUP_POSITION_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  const hasCrewPositions = crewPositions.length > 0;
  const isAwaitingCrew =
    live.rideState === "ACTIVE" && !hasCrewPositions && !isGraceOver;

  // A rider opening navigation after the group has left is asked how to join
  // rather than being silently sent back to the start. Whether they have
  // answered lives in the session, so reopening the screen does not re-ask.
  const shouldAskJoin =
    live.rideState === "ACTIVE" &&
    plannedRoute.isSettled &&
    fix !== null &&
    waypoints !== null &&
    shouldOfferCatchUp({
      riderCoordinate: fix.coordinate,
      start: waypoints[0]!.coordinate,
      groupTargetIndex: groupIndex,
    });

  const { session, skipTarget, placeAt } = useNavigationSession({
    rideId: id,
    waypoints,
    tripGeometry: plannedRoute.tripGeometry,
    isPlannedRouteSettled: plannedRoute.isSettled,
    fix,
    isPlacementBlocked: isAwaitingCrew,
    isJoinChoicePending: shouldAskJoin,
  });

  const needsJoinChoice = shouldAskJoin && session?.isJoinChosen !== true;

  /**
   * Tells the leaders a rider is behind, and where the crew could wait for
   * them. An existing stop is sent as a notification only — everyone already
   * planned to pull in there, so there is nothing to approve — while a new
   * point becomes a pending stop the leaders answer.
   */
  const sendRegroupRequest = async (
    suggestion: RegroupSuggestion,
    existingStopId: string | null,
  ): Promise<string | null> => {
    const { data } = await apiClient.post(`/api/rides/${id}/regroup`, {
      location_coords: [
        suggestion.candidate.coordinate.longitude,
        suggestion.candidate.coordinate.latitude,
      ],
      name: existingStopId
        ? suggestion.candidate.name
        : `Regroup at ${suggestion.candidate.name}`,
      google_place_id: existingStopId ? null : suggestion.candidate.id,
      wait_seconds: Math.round(suggestion.waitSeconds),
      existing_stop_id: existingStopId,
    });

    const stopId: unknown = data?.stop?.id;
    return typeof stopId === "string" ? stopId : null;
  };

  /**
   * Asks the crew to wait somewhere, and says what came of it — catching up
   * in silence leaves the rider wondering whether anyone knows they are
   * behind. Either way they are already routed to the crew, so every outcome
   * here only changes whether the crew waits, never where the rider is sent.
   */
  const proposeRegroup = async (): Promise<void> => {
    const trip = plannedRoute.tripGeometry;
    if (!trip || !waypoints || !fix) return;

    const riderAlongMeters =
      projectOntoPolyline(fix.coordinate, trip.polyline, trip.cumulative)
        ?.distanceAlongMeters ?? 0;

    const plannedStops: RegroupCandidate[] = waypoints.flatMap((waypoint, index) =>
      waypoint.kind === "stop"
        ? [
            {
              id: waypoint.id,
              name: waypoint.name,
              coordinate: waypoint.coordinate,
              alongMeters: trip.waypointAlongMeters[index] ?? 0,
              isExistingStop: true,
            },
          ]
        : [],
    );

    try {
      const alreadyStopping = suggestRegroupPoint({
        candidates: plannedStops,
        groupAlongMeters,
        riderAlongMeters,
      });

      if (alreadyStopping) {
        await sendRegroupRequest(alreadyStopping, alreadyStopping.candidate.id);
        Alert.alert(
          "Catching up",
          `The crew is already stopping at ${alreadyStopping.candidate.name}. Your leaders know you're on your way.`,
        );
        return;
      }

      const encodedPolyline = plannedRoute.route?.encodedPolyline;
      if (!encodedPolyline) {
        Alert.alert("Catching up", "Heading straight for the crew.");
        return;
      }

      const { suggestions } = await fetchStopSuggestions("rest", encodedPolyline);
      const suggestion = suggestRegroupPoint({
        candidates: suggestions.map((place) => ({
          id: place.google_place_id,
          name: place.name,
          coordinate: { latitude: place.coords[1]!, longitude: place.coords[0]! },
          alongMeters: place.distance_along_route_m,
          isExistingStop: false,
        })),
        groupAlongMeters,
        riderAlongMeters,
      });

      if (!suggestion) {
        Alert.alert(
          "Catching up",
          "There's nowhere sensible for the crew to wait, so you're heading straight for them.",
        );
        return;
      }

      const stopId = await sendRegroupRequest(suggestion, null);
      if (stopId) setPendingRegroup({ stopId, name: suggestion.candidate.name });
      Alert.alert(
        "Your leaders have been asked",
        `They've been asked to regroup at ${suggestion.candidate.name}. Keep riding — you're routed to the crew either way.`,
      );
    } catch {
      Alert.alert(
        "Couldn't reach the crew",
        "Nobody could be asked to wait, so you're heading straight for them.",
      );
    }
  };

  // A notify-only regroup has nothing to answer, so it is dismissed locally.
  const [dismissedRegroupStopId, setDismissedRegroupStopId] = useState<string | null>(null);

  // A regroup this rider asked for, until the leaders answer it.
  const [pendingRegroup, setPendingRegroup] = useState<{
    stopId: string;
    name: string;
  } | null>(null);
  const { regroupDecision } = live;
  useEffect(() => {
    if (!pendingRegroup || regroupDecision?.stopId !== pendingRegroup.stopId) return;

    setPendingRegroup(null);
    // An approved stop joins everyone's route on its own; a rejected one just
    // leaves this rider chasing, which is already where they are headed.
    Alert.alert(
      regroupDecision.status === "approved" ? "The crew is waiting" : "Not that spot",
      regroupDecision.status === "approved"
        ? `They'll regroup with you at ${pendingRegroup.name}.`
        : "Your leaders turned that spot down. Keep heading for the crew — if they pick somewhere else it'll appear on your route.",
    );
  }, [pendingRegroup, regroupDecision]);

  const chooseJoin = (targetIndex: number) => {
    // The crew's positions arrive well after this rider's own first fix, so by
    // the time the choice is offered they have usually been placed already.
    // Re-placing is what makes the answer mean anything.
    placeAt(targetIndex);
    // Only a rider chasing the group has anything to regroup about.
    if (targetIndex > 0) void proposeRegroup();
  };

  const decideRegroup = async (status: "approved" | "rejected") => {
    const stopId = live.regroupRequest?.stop?.id;
    if (!stopId) return;

    try {
      await apiClient.patch(`/api/rides/${id}/stops/${stopId}`, { status });
      live.refetch();
    } catch {
      Alert.alert("Couldn't answer", "Check your connection and try again.");
    }
  };

  /**
   * A leader adds their own regroup point. Their stop requests are approved on
   * creation, so the alternative becomes a waypoint for everyone, and the
   * rider's original suggestion is turned down in the same breath.
   */
  const addRegroupStop = async (place: StopSuggestion): Promise<void> => {
    try {
      await apiClient.post(`/api/rides/${id}/stops`, {
        type: "rest",
        location_coords: place.coords,
        name: place.name,
        address: place.address,
        google_place_id: place.google_place_id,
      });
      await decideRegroup("rejected");
    } catch {
      Alert.alert("Couldn't add the stop", "Check your connection and try again.");
    }
  };

  /** Somewhere else along the route for the crew to wait. */
  const counterProposeRegroup = async (): Promise<void> => {
    const encodedPolyline = plannedRoute.route?.encodedPolyline;
    if (!encodedPolyline) {
      Alert.alert("No alternatives yet", "The route hasn't finished loading.");
      return;
    }

    try {
      const { suggestions } = await fetchStopSuggestions("rest", encodedPolyline);
      const options = suggestions.slice(0, MAX_REGROUP_ALTERNATIVES);

      if (options.length === 0) {
        Alert.alert("No alternatives", "Nothing suitable was found along the route.");
        return;
      }

      Alert.alert("Where should the crew wait?", "The stop is added for everyone.", [
        ...options.map((place) => ({
          text: place.name,
          onPress: () => void addRegroupStop(place),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    } catch {
      Alert.alert("Couldn't load places", "Check your connection and try again.");
    }
  };

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

  // Gated on focus as well as foreground: a ride left open behind another
  // screen would otherwise keep billing a traffic refresh every five minutes.
  const liveLeg = useLiveLeg({
    target: targetWaypoint,
    fix,
    isActive: isAppActive && isFocused,
  });

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

  const regroupRequest = live.regroupRequest;
  const regroupStopName = regroupRequest?.stop?.name ?? "a stop";
  const behindRiderName =
    participants.find((participant) => participant.riderId === regroupRequest?.requestedBy)
      ?.displayName ?? "A rider";
  const showRegroupPrompt =
    isHost &&
    regroupRequest !== null &&
    regroupRequest.stop?.id !== dismissedRegroupStopId;
  const isFinished = live.rideState === "COMPLETED" || session?.phase === "FINISHED";

  const tripAction = ((): TripBarAction | null => {
    if (isHost && live.rideState === "NOT_STARTED") {
      // Roll call is open: the next step is setting off, not starting again.
      if (live.liveStatus === "starting") {
        return {
          label: live.isRollingOut ? "Setting off…" : "Roll out",
          onPress: live.rollOut,
          isBusy: live.isRollingOut,
        };
      }

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
          // Remounted whenever a waypoint changes status: that redraws the
          // waypoint's marker, which the map then stacks above the rider. The
          // puck has to be added after it to stay on top of the one it is
          // standing on — otherwise arriving anywhere hides the rider.
          <RiderPuck
            key={`rider-puck-${progress.waypointStatuses.join("")}`}
            coordinate={puckFix.coordinate}
            headingDegrees={headingDegrees ?? puckFix.headingDegrees ?? 0}
          />
        ) : null}
      </MapView>

      {showRegroupPrompt && regroupRequest ? (
        <View style={[styles.joinSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.joinTitle, { color: colors.text }]}>A rider has fallen behind</Text>
          <Text style={[styles.joinBody, { color: colors.textMuted }]}>
            {behindRiderName} is{" "}
            {regroupRequest.isExistingStop
              ? `catching up — the crew is already stopping at ${regroupStopName}`
              : `asking the crew to regroup at ${regroupStopName}`}
            {regroupRequest.waitSeconds
              ? ` · about ${formatDuration(regroupRequest.waitSeconds)} of waiting`
              : ""}
            .
          </Text>

          {regroupRequest.isExistingStop ? (
            // Nothing to decide: everyone was already pulling in there. The
            // leaders only needed to know not to roll out without them.
            <TouchableOpacity
              accessibilityRole='button'
              onPress={() => setDismissedRegroupStopId(regroupRequest.stop?.id ?? null)}
              style={[styles.joinPrimary, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.joinPrimaryText}>Got it</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => decideRegroup("approved")}
                style={[styles.joinPrimary, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.joinPrimaryText}>Add the stop for everyone</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => void counterProposeRegroup()}
                style={[styles.joinSecondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.joinSecondaryText, { color: colors.text }]}>
                  Wait somewhere else
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => decideRegroup("rejected")}
                style={[styles.joinSecondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.joinSecondaryText, { color: colors.text }]}>Keep riding</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      {needsJoinChoice && waypoints ? (
        <View style={[styles.joinSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.joinTitle, { color: colors.text }]}>The ride has already set off</Text>
          <Text style={[styles.joinBody, { color: colors.textMuted }]}>
            The group is heading to {waypointLabel(waypoints[groupIndex] ?? waypoints[0]!)}. How do
            you want to join?
          </Text>

          <TouchableOpacity
            accessibilityRole='button'
            onPress={() => chooseJoin(groupIndex)}
            style={[styles.joinPrimary, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.joinPrimaryText}>Catch up with the group</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole='button'
            onPress={() => chooseJoin(0)}
            style={[styles.joinSecondary, { borderColor: colors.border }]}
          >
            <Text style={[styles.joinSecondaryText, { color: colors.text }]}>
              Join from the start
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
  joinSheet: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "30%",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 80,
    elevation: 80,
  },
  joinTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  joinBody: {
    fontSize: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  joinPrimary: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  joinPrimaryText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  joinSecondary: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  joinSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
