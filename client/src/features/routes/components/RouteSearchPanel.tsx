import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { PlaceSearchInput } from "../../../components/PlaceSearchInput";
import { createPlacesSessionToken } from "../../../api/maps";
import { ROUTE_HIGHLIGHTS, toggleHighlight, type RouteHighlight } from "../core/highlights";
import { LENGTH_FILTERS, type RouteSearchState, type SearchPlace } from "../core/routeSearchQuery";

interface RouteSearchPanelProps {
  state: RouteSearchState;
  onChange: (next: RouteSearchState) => void;
}

/** From and to places, then length and highlight filters. Every part is optional. */
export function RouteSearchPanel({ state, onChange }: RouteSearchPanelProps) {
  const { colors } = useTheme();
  const isSearching =
    state.from !== null || state.to !== null || state.lengthId !== "any" || state.highlights.length > 0;

  return (
    <View style={[styles.panel, { borderBottomColor: colors.border }]}>
      {/* From's suggestions open over the To field, so From sits above it (elevation for Android). */}
      <View style={styles.fromLayer}>
        <PlaceField
          label='From'
          dotColor='#22c55e'
          place={state.from}
          onChange={(from) => onChange({ ...state, from })}
        />
      </View>
      <View style={styles.toLayer}>
        <PlaceField
          label='To'
          dotColor='#ef4444'
          place={state.to}
          onChange={(to) => onChange({ ...state, to })}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {LENGTH_FILTERS.map((filter) => (
          <FilterChip
            key={filter.id}
            label={filter.label}
            isOn={state.lengthId === filter.id}
            role='radio'
            onPress={() => onChange({ ...state, lengthId: filter.id })}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {ROUTE_HIGHLIGHTS.map((highlight) => (
          <FilterChip
            key={highlight.value}
            label={highlight.label}
            isOn={state.highlights.includes(highlight.value)}
            role='checkbox'
            onPress={() =>
              onChange({
                ...state,
                highlights: toggleHighlight(state.highlights as RouteHighlight[], highlight.value),
              })
            }
          />
        ))}
      </ScrollView>

      {isSearching ? (
        <TouchableOpacity
          accessibilityRole='button'
          onPress={() => onChange({ from: null, to: null, lengthId: "any", highlights: [] })}
          style={styles.clearAll}
        >
          <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear search</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface PlaceFieldProps {
  label: string;
  dotColor: string;
  place: SearchPlace | null;
  onChange: (place: SearchPlace | null) => void;
}

/** A picked place reads as a chip with a clear button; otherwise it's the place search box. */
function PlaceField({ label, dotColor, place, onChange }: PlaceFieldProps) {
  const { colors } = useTheme();
  // One billing session per search-and-pick, as in LocationPicker.
  const [sessionToken, setSessionToken] = useState(createPlacesSessionToken);

  if (place) {
    return (
      <View style={[styles.picked, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.pickedText, { color: colors.text }]} numberOfLines={1}>
          <Text style={{ color: colors.textMuted }}>{label} </Text>
          {place.name}
        </Text>
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel={`Clear ${label.toLowerCase()} place`}
          hitSlop={12}
          onPress={() => onChange(null)}
        >
          <X color={colors.textMuted} size={18} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <PlaceSearchInput
      placeholder={`${label}: town, area or landmark`}
      sessionToken={sessionToken}
      onSessionConsumed={() => setSessionToken(createPlacesSessionToken())}
      onSelect={(selected) => onChange({ lat: selected.lat, lng: selected.lng, name: selected.name })}
    />
  );
}

interface FilterChipProps {
  label: string;
  isOn: boolean;
  role: "radio" | "checkbox";
  onPress: () => void;
}

function FilterChip({ label, isOn, role, onPress }: FilterChipProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole={role}
      accessibilityState={role === "radio" ? { selected: isOn } : { checked: isOn }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: isOn ? colors.primary : colors.border },
        isOn ? { backgroundColor: colors.primary + "1A" } : null,
      ]}
    >
      <Text style={[styles.chipText, { color: isOn ? colors.primary : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, borderBottomWidth: 1, zIndex: 10 },
  fromLayer: { zIndex: 3, elevation: 3 },
  toLayer: { zIndex: 2, elevation: 2 },
  picked: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  pickedText: { flex: 1, fontSize: 15 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chips: { gap: 8, paddingVertical: 2, alignItems: "center" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: "600" },
  divider: { width: 1, height: 20 },
  clearAll: { alignSelf: "flex-end", paddingVertical: 2 },
  clearAllText: { fontSize: 13, fontWeight: "600" },
});
