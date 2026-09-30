import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useIsFocused, useRouter } from "expo-router";
import { Activity, LocateFixed, Siren } from "lucide-react-native";
import MapView, { PROVIDER_GOOGLE, Polyline } from "../../../components/MapWrapper";
import { useCurrentRider } from "../../../services/useCurrentRider";
import { useTheme } from "../../../theme/ThemeContext";
import { permits } from "../../consent/core/consent";
import { useConsents } from "../../consent/hooks/useConsents";
import { RiderPuck } from "../../navigation/components/RiderPuck";
import { SpeedBubble } from "../../navigation/components/SpeedBubble";
import { useAppIsActive } from "../../navigation/hooks/useAppIsActive";
import { useNavigationCamera } from "../../navigation/hooks/useNavigationCamera";
import { useNavigationFix } from "../../navigation/hooks/useNavigationFix";
import { useNavigationMapTheme } from "../../navigation/hooks/useNavigationMapTheme";
import { useRideLiveSession } from "../../navigation/hooks/useRideLiveSession";
import { useScreenAwake } from "../../navigation/hooks/useScreenAwake";
import { toLatLng } from "../../navigation/core/tripPlan";
import type { NavigationFix } from "../../navigation/types/navigation";
import { GroupAlertSheet } from "../../rides/components/GroupAlertSheet";
import { useGroupAlert } from "../../rides/hooks/useGroupAlert";
import { useMyRideProgress } from "../../rides/hooks/useMyRideProgress";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { useRecordedTrack } from "../hooks/useRecordedTrack";
import { useRidingNow } from "../hooks/useRidingNow";
import { JustRidingSheet, justRidingSheetHeight } from "./JustRidingSheet";

const KEEP_AWAKE_TAG = "ride-just-riding";
const KMH_PER_MPS = 3.6;
const CONTROL_GAP = 12;
/** Room the top pill takes, for framing the rider below it. */
const TOP_PILL_SPACE = 56;
const TRACK_WIDTH = 5;
const INITIAL_REGION_DELTA = 0.02;
/** The clock shows seconds. */
const CLOCK_TICK_MS = 1000;
/**
 * Held until the map reports ready: a padding update before the GoogleMap
 * exists crashes react-native-maps (see MAP_PADDING_BEFORE_READY in
 * app/ride/[id]/navigation.tsx).
 */
const MAP_PADDING_BEFORE_READY = { top: 0, right: 0, bottom: 0, left: 0 } as const;

interface JustRidingViewProps {
  rideId: string;
}

/**
 * A ride with no destination (docs/ride-now-ux.md §4.3, "Just riding"): no
 * banner or route, the line ridden so far behind the puck, and riding time
 * and distance in the sheet.
 */
export function JustRidingView({ rideId }: JustRidingViewProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const currentRiderId = useCurrentRider().riderId as string | undefined;
  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const handleMapReady = useCallback(() => setIsMapReady(true), []);
  const sheetHeight = justRidingSheetHeight(insets.bottom);

  const rideDetailHref = `/ride/${rideId}` as Href;
  const exit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(rideDetailHref);
  }, [rideDetailHref, router]);

  const live = useRideLiveSession({
    rideId,
    currentRiderId,
    isAppActive,
    onRideEnded: () => router.replace(rideDetailHref),
  });
  useScreenAwake(isFocused && isAppActive, KEEP_AWAKE_TAG);

  const { inRoom, upsertLocation } = live;
  const publishPosition = useCallback(
    (next: NavigationFix) => {
      if (!inRoom) return;
      upsertLocation({
        lon: next.coordinate.longitude,
        lat: next.coordinate.latitude,
        speed_kmh: next.speedMps !== null ? next.speedMps * KMH_PER_MPS : undefined,
        heading_deg: next.headingDegrees ?? undefined,
        accuracy_m: next.accuracyMeters ?? undefined,
        captured_at: new Date(next.timestamp).toISOString(),
      });
    },
    [inRoom, upsertLocation],
  );

  const { fix, headingDegrees, isPermissionDenied } = useNavigationFix({
    isEnabled: isAppActive && live.isTracking,
    onPosition: publishPosition,
  });
  const track = useRecordedTrack(rideId, fix);

  const mapTheme = useNavigationMapTheme();
  const camera = useNavigationCamera({
    mapRef,
    isMapReady,
    fix,
    headingDegrees,
    topInset: insets.top + TOP_PILL_SPACE,
    bottomInset: sheetHeight,
  });

  const groupAlert = useGroupAlert(rideId);
  const myRide = useMyRideProgress({ rideId, me: live.me, announceCompletion: false });

  // Time from when this rider's ride started; distance from the server's
  // reading of their recorded samples.
  const startedAtMs = live.me?.ride_started_at ? Date.parse(live.me.ride_started_at) : null;
  // Until the start is known the sheet shows 0; a fixed base keeps the clock
  // from restarting on every render meanwhile.
  const elapsedSeconds = useElapsedSeconds(0, startedAtMs ?? 0, CLOCK_TICK_MS);
  const { ride: riding } = useRidingNow();
  const distanceKm = riding?.id === rideId ? riding.distance_km : 0;

  const overview = useConsents().data;
  const isRecording = overview ? permits(overview, "ride_recording") : true;

  // Finishing opens the summary. Only on the change, once progress is known,
  // or loading it would look like the ride ending.
  const rideEnded = myRide.isFinished || live.rideState === "COMPLETED";
  const isProgressKnown = live.me !== null;
  const lastRideEndedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isProgressKnown) return;
    if (rideEnded && lastRideEndedRef.current === false) {
      router.replace(`/ride/${rideId}/summary` as Href);
    }
    lastRideEndedRef.current = rideEnded;
  }, [isProgressKnown, rideEnded, rideId, router]);

  const confirmFinish = () =>
    Alert.alert("Finish your ride?", "Your ride is saved and you'll see its summary.", [
      { text: "Not Yet", style: "cancel" },
      { text: "Finish", onPress: myRide.finishMyRideNow },
    ]);

  const start = toLatLng(live.ride?.start_point_geojson?.coordinates);
  const initialRegion = start
    ? {
        ...start,
        latitudeDelta: INITIAL_REGION_DELTA,
        longitudeDelta: INITIAL_REGION_DELTA,
      }
    : undefined;

  const pillLabel = isPermissionDenied
    ? "Location is off — allow it to record"
    : `Just riding · ${isRecording ? "recording" : "not recording"}`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        userInterfaceStyle={mapTheme.isNight ? "dark" : "light"}
        customMapStyle={mapTheme.mapStyle}
        mapPadding={isMapReady ? camera.mapPadding : MAP_PADDING_BEFORE_READY}
        onMapReady={handleMapReady}
        rotateEnabled
        pitchEnabled
        toolbarEnabled={false}
        onRegionChange={camera.onRegionChange}
        onPanDrag={camera.onPanDrag}
        initialRegion={initialRegion}
      >
        {track.length > 1 ? (
          <Polyline coordinates={track} strokeColor={colors.primary} strokeWidth={TRACK_WIDTH} lineCap='round' />
        ) : null}
        {fix ? (
          <RiderPuck coordinate={fix.coordinate} headingDegrees={headingDegrees ?? fix.headingDegrees ?? 0} />
        ) : null}
      </MapView>

      <View pointerEvents='none' style={[styles.pillRow, { top: insets.top + 16 }]}>
        <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Activity color={colors.text} size={16} />
          <Text style={[styles.pillText, { color: colors.text }]}>{pillLabel}</Text>
        </View>
      </View>

      <View pointerEvents='box-none' style={[styles.speedSlot, { bottom: sheetHeight + CONTROL_GAP }]}>
        <SpeedBubble speedMps={fix?.speedMps ?? null} />
      </View>

      {camera.mode !== "follow" && fix ? (
        <View pointerEvents='box-none' style={[styles.recenterRow, { bottom: sheetHeight + CONTROL_GAP + 10 }]}>
          <TouchableOpacity
            accessibilityRole='button'
            accessibilityLabel='Re-center on your position'
            onPress={camera.follow}
            style={[styles.recenter, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <LocateFixed color={colors.primary} size={18} />
            <Text style={[styles.recenterText, { color: colors.text }]}>Re-center</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Today's alert sheet, with its Call 112; the solo Safety sheet replaces it (§4.4). */}
      <TouchableOpacity
        accessibilityRole='button'
        accessibilityLabel='Get help'
        onPress={groupAlert.openSheet}
        disabled={groupAlert.isSending}
        style={[styles.alertButton, { bottom: sheetHeight + CONTROL_GAP, backgroundColor: colors.danger }]}
      >
        <Siren color='white' size={26} />
      </TouchableOpacity>

      <JustRidingSheet
        elapsedSeconds={startedAtMs === null ? 0 : elapsedSeconds}
        distanceKm={distanceKm}
        onExit={exit}
        onFinish={confirmFinish}
        isFinishing={myRide.isFinishingMyRide}
      />

      <GroupAlertSheet
        visible={groupAlert.isSheetOpen}
        isSending={groupAlert.isSending}
        onSend={() => void groupAlert.send()}
        onClose={groupAlert.closeSheet}
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
  pillRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 60,
    elevation: 60,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  speedSlot: {
    position: "absolute",
    left: 16,
    zIndex: 66,
    elevation: 66,
  },
  recenterRow: {
    position: "absolute",
    left: 96,
    right: 96,
    alignItems: "center",
    zIndex: 65,
    elevation: 65,
  },
  recenter: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  recenterText: {
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 8,
  },
  alertButton: {
    position: "absolute",
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 66,
    elevation: 66,
  },
});
