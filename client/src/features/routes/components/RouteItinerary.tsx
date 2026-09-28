import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { ItineraryRow } from "../core/routeSummary";

/** Same colours as the map's markers, so the list and the map read as one. */
export const ITINERARY_COLORS = {
  start: "#22c55e",
  stop: "#f59e0b",
  destination: "#ef4444",
} as const;

interface RouteItineraryProps {
  rows: readonly ItineraryRow[];
}

/** A to B through every stop, with how far along each is and the saver's notes. */
export function RouteItinerary({ rows }: RouteItineraryProps) {
  const { colors } = useTheme();

  return (
    <View accessibilityRole='list'>
      {rows.map((row, index) => {
        const isLast = index === rows.length - 1;
        return (
          <View key={`${row.kind}-${row.marker}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.marker, { backgroundColor: ITINERARY_COLORS[row.kind] }]}>
                <Text style={[styles.markerText, { color: row.kind === "stop" ? "#0f172a" : "#ffffff" }]}>
                  {row.marker}
                </Text>
              </View>
              {isLast ? null : <View style={[styles.line, { backgroundColor: colors.border }]} />}
            </View>
            <View style={[styles.content, isLast ? null : styles.contentGap]}>
              <View style={styles.titleRow}>
                <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
                {row.distance ? (
                  <Text style={[styles.distance, { color: colors.textMuted }]}>{row.distance}</Text>
                ) : null}
              </View>
              {row.detail ? (
                <Text style={[styles.detail, { color: colors.textMuted }]}>{row.detail}</Text>
              ) : null}
              {row.note ? (
                <Text style={[styles.note, { color: colors.text }]}>“{row.note}”</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const MARKER_SIZE = 26;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  rail: { width: MARKER_SIZE, alignItems: "center" },
  marker: { width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: MARKER_SIZE / 2, alignItems: "center", justifyContent: "center" },
  markerText: { fontSize: 12, fontWeight: "800" },
  line: { flex: 1, width: 2, marginVertical: 2 },
  content: { flex: 1, paddingTop: 3 },
  contentGap: { paddingBottom: 16 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "600" },
  distance: { fontSize: 13, fontVariant: ["tabular-nums"] },
  detail: { fontSize: 12, marginTop: 2 },
  note: { fontSize: 13, fontStyle: "italic", marginTop: 3 },
});
