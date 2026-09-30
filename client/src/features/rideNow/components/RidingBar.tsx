import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { permits } from "../../consent/core/consent";
import { useConsents } from "../../consent/hooks/useConsents";
import { ridingBarSubtitle, ridingBarTitle } from "../core/ridingStats";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { useRidingNow } from "../hooks/useRidingNow";

export const RIDING_BAR_HEIGHT = 56;
/** The bar reads in minutes, so it needn't redraw every second. */
const BAR_TICK_MS = 15_000;

interface RidingBarViewProps {
  rideId: string;
  title: string;
  elapsedS: number;
  distanceKm: number;
  readAtMs: number;
}

function RidingBarView({ rideId, title, elapsedS, distanceKm, readAtMs }: RidingBarViewProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const overview = useConsents().data;
  const isRecording = overview ? permits(overview, "ride_recording") : true;
  const elapsed = useElapsedSeconds(elapsedS, readAtMs, BAR_TICK_MS);

  const heading = ridingBarTitle(elapsed, distanceKm);
  const detail = ridingBarSubtitle(title, isRecording);

  return (
    <TouchableOpacity
      accessibilityRole='button'
      accessibilityLabel={`${heading}. ${detail}. Open your ride`}
      onPress={() => router.push(`/ride/${rideId}/navigation` as Href)}
      activeOpacity={0.85}
      style={[styles.bar, { backgroundColor: colors.ridingBar }]}
    >
      <View style={[styles.dot, { backgroundColor: colors.ridingBarDot }]} />
      <View style={styles.text}>
        <Text style={styles.heading} numberOfLines={1}>
          {heading}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Text style={styles.open}>Open</Text>
      <ChevronRight color='white' size={20} />
    </TouchableOpacity>
  );
}

/**
 * The ride under way, above the tabs on every tab (docs/ride-now-ux.md §4.6,
 * riding stage). Nothing shows when no ride is under way.
 */
export function RidingBar() {
  const { ride, readAtMs } = useRidingNow();
  if (!ride) return null;

  return (
    <RidingBarView
      rideId={ride.id}
      title={ride.title}
      elapsedS={ride.elapsed_s}
      distanceKm={ride.distance_km}
      readAtMs={readAtMs}
    />
  );
}

/** Whether the bar is showing, for the room the tabs leave it. */
export const useIsRidingBarShown = (): boolean => useRidingNow().ride !== null;

const styles = StyleSheet.create({
  bar: {
    height: RIDING_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  heading: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  detail: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
  },
  open: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
});
