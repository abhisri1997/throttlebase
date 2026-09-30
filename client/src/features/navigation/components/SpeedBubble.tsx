import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { isOverLimit, speedometerLabel } from "../core/speedometer";

interface Props {
  speedMps: number | null;
  /** The road's posted limit, when known. Shown as a sign above the speed. */
  limitKmh?: number | null;
}

/**
 * The rider's speed, bottom left, the size of the alert button opposite.
 * With a known limit, a round limit sign sits above it and the speed turns
 * red over the limit. Display only: nothing here is tappable while riding.
 */
export function SpeedBubble({ speedMps, limitKmh }: Props) {
  const { colors } = useTheme();
  const label = speedometerLabel(speedMps);
  const over = isOverLimit(speedMps, limitKmh);

  return (
    <View pointerEvents='none' style={styles.stack}>
      {limitKmh ? (
        <View
          accessibilityLabel={`Speed limit ${limitKmh} kilometres per hour`}
          style={[styles.limit, { borderColor: colors.danger }]}
        >
          <Text style={styles.limitText}>{limitKmh}</Text>
        </View>
      ) : null}
      <View
        accessibilityLabel={label === "--" ? "Speed unknown" : `${label} kilometres per hour`}
        style={[
          styles.speed,
          {
            backgroundColor: over ? colors.danger : colors.surface,
            borderColor: over ? colors.danger : colors.border,
          },
        ]}
      >
        <Text style={[styles.value, { color: over ? "#ffffff" : colors.text }]}>{label}</Text>
        <Text style={[styles.unit, { color: over ? "#ffffff" : colors.textMuted }]}>km/h</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: "center", gap: 8 },
  limit: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 5,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  limitText: { color: "#111111", fontSize: 17, fontWeight: "800" },
  speed: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { fontSize: 22, fontWeight: "800", lineHeight: 24 },
  unit: { fontSize: 10, fontWeight: "600" },
});
