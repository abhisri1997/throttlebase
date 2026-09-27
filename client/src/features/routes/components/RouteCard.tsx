import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { routeFacts, routeHeadline, viaLine, type RouteSummaryInput } from "../core/routeSummary";
import { HighlightChips } from "./HighlightChips";
import { RouteShape } from "./RouteShape";

const SHAPE_HEIGHT = 84;
const MAX_CARD_HIGHLIGHTS = 3;

export interface RouteListItem extends RouteSummaryInput {
  id: string;
  visibility: string;
  created_at: string;
  creator_id: string;
  creator_name?: string;
  geojson?: { coordinates?: number[][] } | null;
}

interface RouteCardProps {
  route: RouteListItem;
  /** The signed-in rider, so their own routes read "You". */
  viewerId: string | null;
  onPress: () => void;
}

/**
 * A route in the Routes list: where it goes first, then how it goes (its
 * stops, length, ride time and highlights), then who rode it.
 */
export function RouteCard({ route, viewerId, onPress }: RouteCardProps) {
  const { colors } = useTheme();
  const [shapeWidth, setShapeWidth] = useState(0);
  const headline = routeHeadline(route);
  const facts = routeFacts(route);
  const via = viaLine(route.via);
  const isMine = viewerId !== null && route.creator_id === viewerId;
  const savedOn = new Date(route.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const author = isMine ? "You" : route.creator_name ?? "A rider";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole='button'
      accessibilityLabel={`${headline}. ${facts.join(", ")}. Saved by ${author}.`}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        style={[styles.shape, { backgroundColor: colors.bg }]}
        onLayout={(event) => setShapeWidth(Math.round(event.nativeEvent.layout.width))}
      >
        {shapeWidth > 0 && route.geojson?.coordinates ? (
          <RouteShape
            coordinates={route.geojson.coordinates}
            width={shapeWidth}
            height={SHAPE_HEIGHT}
            color={colors.primary}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.headlineRow}>
          <Text style={[styles.headline, { color: colors.text }]} numberOfLines={2}>
            {headline}
          </Text>
          {route.visibility === "private" ? (
            <View style={[styles.pill, { backgroundColor: colors.primary + "26" }]}>
              <Text style={[styles.pillText, { color: colors.primary }]}>ONLY YOU</Text>
            </View>
          ) : null}
        </View>
        {via ? (
          <Text style={[styles.via, { color: colors.textMuted }]} numberOfLines={1}>
            {via}
          </Text>
        ) : null}
        {facts.length > 0 ? (
          <Text style={[styles.facts, { color: colors.text }]}>{facts.join("  ·  ")}</Text>
        ) : null}
        <HighlightChips highlights={route.highlights} max={MAX_CARD_HIGHLIGHTS} />
        <Text style={[styles.by, { color: colors.textMuted }]}>
          {author} · saved {savedOn}
          {headline !== route.title ? ` · "${route.title}"` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  shape: { height: SHAPE_HEIGHT },
  body: { padding: 14, gap: 6 },
  headlineRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  headline: { flex: 1, fontSize: 17, fontWeight: "700" },
  pill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, marginTop: 2 },
  pillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  via: { fontSize: 13 },
  facts: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  by: { fontSize: 12 },
});
