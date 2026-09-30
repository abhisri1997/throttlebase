import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, LocateFixed, MapPin, Navigation, X } from "lucide-react-native";
import MapView, { PROVIDER_GOOGLE } from "../../../components/MapWrapper";
import { PlaceSearchInput, type SelectedPlace } from "../../../components/PlaceSearchInput";
import { createPlacesSessionToken } from "../../../api/maps";
import { devicePreferences } from "../../../services/devicePreferences";
import { useTheme } from "../../../theme/ThemeContext";
import { RiderPuck } from "../../navigation/components/RiderPuck";
import { automaticRideName } from "../core/rideNowName";
import { alreadyRidingRideId, startRideNow, type RideNowDestination } from "../api/rideNow";
import { RIDING_NOW_QUERY_KEY } from "../hooks/useRidingNow";
import { useRideReadiness } from "../hooks/useRideReadiness";
import { ReadinessChips } from "./ReadinessChips";

const FIRST_RIDE_NOTE_KEY = "rideNow.firstRideNoteDismissed";
const MAP_HEIGHT = 250;
const MAP_ZOOM = 15;

/** Shown until the rider dismisses it once; a storage failure only means it shows again. */
const useFirstRideNote = (): { isShown: boolean; dismiss: () => void } => {
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    devicePreferences
      .get(FIRST_RIDE_NOTE_KEY)
      .then((value) => setIsShown(value === null))
      .catch(() => setIsShown(true));
  }, []);

  const dismiss = useCallback(() => {
    setIsShown(false);
    devicePreferences.set(FIRST_RIDE_NOTE_KEY, "1").catch((error: unknown) =>
      console.warn("[RideNow] could not remember the first-ride note:", error),
    );
  }, []);

  return { isShown, dismiss };
};

/**
 * Ride now's start screen (docs/ride-now-ux.md §4.2): an optional
 * destination, a readiness check, and Start Riding. There is no form and no
 * roll call; the ride is made, set off and opened in one step.
 */
export function RideNowScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const readiness = useRideReadiness();
  const firstRideNote = useFirstRideNote();
  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const [destination, setDestination] = useState<RideNowDestination | null>(null);
  const [placesSessionToken, setPlacesSessionToken] = useState(createPlacesSessionToken);
  const { fix } = readiness;

  const openRide = useCallback(
    (rideId: string) => router.replace(`/ride/${rideId}/navigation` as Href),
    [router],
  );

  const start = useMutation({
    mutationFn: startRideNow,
    onSuccess: async (rideId) => {
      // Tracking starts on the next poll: ask now rather than in 30 s.
      await queryClient.invalidateQueries({ queryKey: RIDING_NOW_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["rides"] });
      openRide(rideId);
    },
    onError: (error: unknown) => {
      const ridingId = alreadyRidingRideId(error);
      if (!ridingId) return;
      Alert.alert("You're already on a ride", "Finish it before starting another.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open", onPress: () => openRide(ridingId) },
      ]);
    },
  });

  const centreOnMe = useCallback(() => {
    if (!fix) return;
    mapRef.current?.animateCamera({ center: fix.coordinate, zoom: MAP_ZOOM }, { duration: 400 });
  }, [fix]);

  // The map opens on the rider once their position is known. Only the first
  // fix moves it; after that the rider decides.
  const hasCentredRef = useRef(false);
  useEffect(() => {
    if (hasCentredRef.current || !fix) return;
    hasCentredRef.current = true;
    centreOnMe();
  }, [centreOnMe, fix]);

  const chooseDestination = (place: SelectedPlace) =>
    setDestination({ coordinate: { latitude: place.lat, longitude: place.lng }, name: place.name });

  const rideName = automaticRideName(new Date(), destination?.name);
  // Routing needs a start, so a ride with a destination waits for the first fix.
  const isWaitingForGps = destination !== null && !fix;
  const canStart = readiness.location === "granted" && !isWaitingForGps && !start.isPending;
  const failed = start.isError && alreadyRidingRideId(start.error) === null;

  const startRiding = () =>
    start.mutate({
      title: automaticRideName(new Date(), destination?.name),
      start: fix?.coordinate ?? null,
      destination,
    });

  const buttonLabel = start.isPending
    ? "Starting..."
    : isWaitingForGps
      ? "Waiting for GPS..."
      : failed
        ? "Try Again"
        : "Start Riding";

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel='Close'
          onPress={() => router.back()}
          style={styles.close}
        >
          <X color={colors.text} size={24} />
        </TouchableOpacity>
        <Text accessibilityRole='header' style={[styles.title, { color: colors.text }]}>
          Ride Now
        </Text>
      </View>

      <View style={styles.map}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          toolbarEnabled={false}
        >
          {fix ? <RiderPuck coordinate={fix.coordinate} headingDegrees={fix.headingDegrees ?? 0} /> : null}
        </MapView>
        {fix ? (
          <TouchableOpacity
            accessibilityRole='button'
            accessibilityLabel='Centre on me'
            onPress={centreOnMe}
            style={[styles.centre, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <LocateFixed color={colors.text} size={20} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps='handled'>
        {destination ? (
          <View style={[styles.destination, { backgroundColor: colors.inputBg }]}>
            <MapPin color={colors.primary} size={20} />
            <Text style={[styles.destinationName, { color: colors.text }]} numberOfLines={1}>
              {destination.name}
            </Text>
            <TouchableOpacity
              accessibilityRole='button'
              accessibilityLabel={`Clear ${destination.name}`}
              onPress={() => setDestination(null)}
              hitSlop={10}
            >
              <Text style={[styles.clear, { color: colors.primary }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <PlaceSearchInput
            placeholder='Where to? (optional)'
            sessionToken={placesSessionToken}
            onSessionConsumed={() => setPlacesSessionToken(createPlacesSessionToken())}
            onSelect={chooseDestination}
          />
        )}
        <Text style={[styles.helper, { color: colors.textMuted }]}>
          Leave it empty to just ride. Your ride is recorded either way.
        </Text>

        <ReadinessChips
          readiness={readiness}
          onOpenRecordingSettings={() => router.push("/(modals)/consents")}
        />

        {firstRideNote.isShown ? (
          <View style={[styles.note, { borderColor: colors.warning }]}>
            <Info color={colors.warning} size={20} />
            <View style={styles.noteText}>
              <Text style={[styles.noteTitle, { color: colors.text }]}>Before your first ride</Text>
              <Text style={[styles.noteBody, { color: colors.textMuted }]}>
                Mount your phone and set up before you ride. Don&apos;t use it while moving.
              </Text>
              <TouchableOpacity accessibilityRole='button' onPress={firstRideNote.dismiss} hitSlop={8}>
                <Text style={[styles.gotIt, { color: colors.primary }]}>Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {failed ? (
          <Text accessibilityLiveRegion='polite' style={[styles.error, { color: colors.danger }]}>
            Couldn&apos;t start your ride. Check your connection and try again.
          </Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityState={{ disabled: !canStart, busy: start.isPending }}
          disabled={!canStart}
          onPress={startRiding}
          style={[styles.start, { backgroundColor: colors.primary, opacity: canStart ? 1 : 0.5 }]}
        >
          {start.isPending ? <ActivityIndicator color='white' /> : <Navigation color='white' size={20} />}
          <Text style={styles.startText}>{buttonLabel}</Text>
        </TouchableOpacity>
        <Text style={[styles.caption, { color: colors.textMuted }]}>
          Named &ldquo;{rideName}&rdquo;. Rename it when you finish.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  close: {
    width: 44,
    height: 44,
    marginLeft: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  map: {
    height: MAP_HEIGHT,
  },
  centre: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 16,
    gap: 12,
  },
  destination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  destinationName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  clear: {
    fontSize: 14,
    fontWeight: "700",
  },
  helper: {
    fontSize: 13,
    marginTop: -4,
  },
  note: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  noteText: {
    flex: 1,
    gap: 4,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  noteBody: {
    fontSize: 14,
  },
  gotIt: {
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 4,
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  error: {
    fontSize: 14,
    textAlign: "center",
  },
  start: {
    height: 56,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  caption: {
    fontSize: 13,
    textAlign: "center",
  },
});
