import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flag, X } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { formatRidingClock, ridingDetailLine } from "../core/ridingStats";

/** Height above the home indicator, for placing the map's controls over it. */
const SHEET_BASE_HEIGHT = 136;
const ROUND_BUTTON_SIZE = 44;

export const justRidingSheetHeight = (bottomInset: number): number => SHEET_BASE_HEIGHT + bottomInset;

interface JustRidingSheetProps {
  elapsedSeconds: number;
  distanceKm: number;
  onExit: () => void;
  onFinish: () => void;
  isFinishing: boolean;
}

/**
 * The live sheet with no destination (docs/ride-now-ux.md §4.3, "Just
 * riding"): riding time as the big figure, distance and average under it.
 * The stopped sheet, hold to finish and Add destination come with the motion
 * lock; until then Finish Ride asks first.
 */
export function JustRidingSheet({ elapsedSeconds, distanceKm, onExit, onFinish, isFinishing }: JustRidingSheetProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const clock = formatRidingClock(elapsedSeconds);
  const detail = ridingDetailLine(distanceKm, elapsedSeconds);

  return (
    <View
      style={[
        styles.sheet,
        {
          height: justRidingSheetHeight(bottom),
          paddingBottom: bottom + 16,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={[styles.handle, { backgroundColor: colors.border }]} />
      <View style={styles.tripRow}>
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel='Exit navigation'
          onPress={onExit}
          style={[styles.roundButton, { backgroundColor: colors.bg, borderColor: colors.border }]}
        >
          <X color={colors.text} size={22} />
        </TouchableOpacity>

        <View accessible accessibilityLabel={`Riding for ${clock}. ${detail}`} style={styles.tripText}>
          <Text style={[styles.clock, { color: colors.primary }]}>{clock}</Text>
          <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        </View>

        {/* Balances the exit button, so the figures sit in the middle. */}
        <View style={styles.roundSpacer} />
      </View>

      <TouchableOpacity
        accessibilityRole='button'
        accessibilityState={{ disabled: isFinishing, busy: isFinishing }}
        disabled={isFinishing}
        onPress={onFinish}
        style={[styles.finish, { backgroundColor: colors.bg, borderColor: colors.border }]}
      >
        {isFinishing ? (
          <ActivityIndicator color={colors.textMuted} size='small' />
        ) : (
          <Flag color={colors.textMuted} size={16} />
        )}
        <Text style={[styles.finishText, { color: colors.text }]}>Finish Ride</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
    zIndex: 70,
    elevation: 70,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  roundButton: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  roundSpacer: {
    width: ROUND_BUTTON_SIZE,
  },
  tripText: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  clock: {
    fontSize: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  detail: {
    fontSize: 14,
  },
  finish: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  finishText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
