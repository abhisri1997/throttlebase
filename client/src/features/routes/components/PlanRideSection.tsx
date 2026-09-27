import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { RideDirection } from "../core/planRide";
import { shortPlace } from "../core/routeSummary";

interface PlanRideSectionProps {
  startName: string | null;
  endName: string | null;
  direction: RideDirection;
  onDirectionChange: (direction: RideDirection) => void;
  onPlan: () => void;
}

/** On a route's page: which way round to ride it, and the way into planning the ride. */
export function PlanRideSection({ startName, endName, direction, onDirectionChange, onPlan }: PlanRideSectionProps) {
  const { colors } = useTheme();
  const start = startName ? shortPlace(startName) : "A";
  const end = endName ? shortPlace(endName) : "B";
  const isLoop = start === end;

  const options: { value: RideDirection; label: string }[] = [
    { value: "forward", label: isLoop ? "As ridden" : `${start} → ${end}` },
    { value: "reverse", label: isLoop ? "The other way" : `${end} → ${start}` },
  ];

  return (
    <View style={styles.section}>
      <View
        accessibilityRole='radiogroup'
        style={[styles.segments, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
      >
        {options.map((option) => {
          const isSelected = option.value === direction;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole='radio'
              accessibilityState={{ selected: isSelected }}
              onPress={() => onDirectionChange(option.value)}
              style={[styles.segment, isSelected ? { backgroundColor: colors.surface, borderColor: colors.primary } : null]}
            >
              <Text
                numberOfLines={1}
                style={[styles.segmentText, { color: isSelected ? colors.text : colors.textMuted }]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        accessibilityRole='button'
        onPress={onPlan}
        style={[styles.primary, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.primaryText}>Plan a ride on this route</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 16 },
  segments: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentText: { fontSize: 13, fontWeight: "700" },
  primary: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryText: { color: "white", fontSize: 15, fontWeight: "700" },
});
