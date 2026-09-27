import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { RoutePlanStop } from "../core/planRide";

interface RoutePlanCardProps {
  /** "Electronic City → HSR Layout", or the route's title. */
  title: string;
  isReversed: boolean;
  followRoad: boolean;
  onFollowRoadChange: (followRoad: boolean) => void;
  /** The route's stops, in riding order. Omitted when editing a ride. */
  stops?: readonly RoutePlanStop[];
  isStopKept?: (stop: RoutePlanStop) => boolean;
  onStopKeptChange?: (stop: RoutePlanStop, keep: boolean) => void;
}

const formatKm = (km: number): string => `${Math.round(km)} km`;

/**
 * On the create-ride form for a ride planned on a saved route: whether the
 * ride follows the route's road, and which of its stops it keeps.
 */
export function RoutePlanCard({
  title,
  isReversed,
  followRoad,
  onFollowRoadChange,
  stops = [],
  isStopKept,
  onStopKeptChange,
}: RoutePlanCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderColor: colors.primary + "50", backgroundColor: colors.primary + "10" }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>PLANNED ON A SAVED ROUTE</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {isReversed ? (
        <Text style={[styles.muted, { color: colors.textMuted }]}>Ridden the other way round</Text>
      ) : null}

      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={[styles.label, { color: colors.text }]}>Follow this road</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            {followRoad
              ? "Everyone is guided along the road this route was ridden on."
              : "Google picks the quickest road between the start, stops and destination."}
          </Text>
        </View>
        <Switch
          value={followRoad}
          onValueChange={onFollowRoadChange}
          accessibilityLabel='Follow this road'
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor='white'
        />
      </View>

      {stops.length > 0 && isStopKept && onStopKeptChange ? (
        <View style={styles.stops}>
          <Text style={[styles.label, { color: colors.text }]}>Stops to keep</Text>
          {stops.map((stop) => {
            const isKept = isStopKept(stop);
            return (
              <TouchableOpacity
                key={`${stop.coords[0]},${stop.coords[1]}`}
                onPress={() => onStopKeptChange(stop, !isKept)}
                accessibilityRole='checkbox'
                accessibilityState={{ checked: isKept }}
                accessibilityLabel={`${stop.name}${stop.distanceKm !== null ? `, ${formatKm(stop.distanceKm)} in` : ""}`}
                style={styles.stopRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: isKept ? colors.primary : colors.border },
                    isKept ? { backgroundColor: colors.primary } : null,
                  ]}
                >
                  {isKept ? <Check color='white' size={14} /> : null}
                </View>
                <View style={styles.stopText}>
                  <View style={styles.stopTitleRow}>
                    <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={1}>
                      {stop.name}
                    </Text>
                    {stop.distanceKm !== null ? (
                      <Text style={[styles.muted, { color: colors.textMuted }]}>{formatKm(stop.distanceKm)}</Text>
                    ) : null}
                  </View>
                  {stop.note ? (
                    <Text style={[styles.note, { color: colors.textMuted }]}>“{stop.note}”</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const CHECKBOX_SIZE = 22;

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: "800" },
  title: { fontSize: 17, fontWeight: "700" },
  muted: { fontSize: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  toggleText: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: "700" },
  stops: { marginTop: 14, gap: 4 },
  stopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 8 },
  checkbox: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stopText: { flex: 1, gap: 2 },
  stopTitleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  stopName: { flex: 1, fontSize: 14, fontWeight: "600" },
  note: { fontSize: 12, fontStyle: "italic" },
});
