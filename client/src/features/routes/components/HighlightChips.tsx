import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { highlightChips } from "../core/routeSummary";

interface HighlightChipsProps {
  highlights: readonly string[];
  /** How many to show before "+N"; every one when left out. */
  max?: number;
}

/** A route's highlights as small read-only chips, e.g. "Scenic road · Great stops · +2". */
export function HighlightChips({ highlights, max = Number.POSITIVE_INFINITY }: HighlightChipsProps) {
  const { colors } = useTheme();
  const { labels, more } = highlightChips(highlights, max);
  if (labels.length === 0) return null;

  return (
    <View style={styles.row}>
      {labels.map((label) => (
        <View key={label} style={[styles.chip, { backgroundColor: colors.primary + "1A" }]}>
          <Text style={[styles.text, { color: colors.primary }]}>{label}</Text>
        </View>
      ))}
      {more > 0 ? (
        <View style={[styles.chip, { backgroundColor: colors.border }]}>
          <Text style={[styles.text, { color: colors.textMuted }]}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  text: { fontSize: 12, fontWeight: "600" },
});
