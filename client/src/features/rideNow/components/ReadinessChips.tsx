import React, { type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CircleAlert, LocateFixed, Radio } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { RideReadiness } from "../hooks/useRideReadiness";

interface ChipProps {
  icon: ReactNode;
  label: string;
  /** Only chips that need attention do anything when tapped. */
  onPress?: () => void;
}

function Chip({ icon, label, onPress }: ChipProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon}
      <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.chip, { backgroundColor: colors.inputBg }]}>
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: colors.inputBg }]}
    >
      {content}
    </TouchableOpacity>
  );
}

interface ReadinessChipsProps {
  readiness: RideReadiness;
  onOpenRecordingSettings: () => void;
}

/** Location, GPS and recording before setting off (docs/ride-now-ux.md §4.2). */
export function ReadinessChips({ readiness, onOpenRecordingSettings }: ReadinessChipsProps) {
  const { colors } = useTheme();
  const good = colors.primary;
  const attention = colors.warning;

  const locationChip =
    readiness.location === "denied" ? (
      <Chip
        icon={<LocateFixed color={attention} size={14} />}
        label='Turn on location'
        onPress={readiness.requestLocation}
      />
    ) : readiness.location === "granted" ? (
      <Chip icon={<LocateFixed color={good} size={14} />} label='Location on' />
    ) : null;

  const gpsChip =
    readiness.location !== "granted" ? null : readiness.gps === "searching" ? (
      <Chip icon={<Radio color={colors.textMuted} size={14} />} label='Finding GPS…' />
    ) : (
      <Chip
        icon={<Radio color={readiness.gps === "good" ? good : attention} size={14} />}
        label={readiness.gps === "good" ? "GPS good" : "Weak GPS"}
      />
    );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {locationChip}
        {gpsChip}
      </View>
      {readiness.isRecording ? null : (
        <Chip
          icon={<CircleAlert color={attention} size={14} />}
          label="Recording is off. Your ride won't be saved."
          onPress={onOpenRecordingSettings}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
});
