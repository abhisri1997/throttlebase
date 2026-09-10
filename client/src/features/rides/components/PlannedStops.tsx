import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import LocationPicker from "../../../components/LocationPicker";
import { useStopSuggestions } from "../api/stopSuggestions";
import { StopSuggestionRow } from "./StopSuggestionRow";
import {
  formatDistanceAlong,
  insertStopInRouteOrder,
  STOP_ICONS,
  STOP_LABELS,
  STOP_TYPES,
  type PlannedStop,
  type StopSuggestion,
  type StopType,
} from "../types/stops";

const MANUAL_SEARCH_ACCENT = "#f59e0b";

interface PlannedStopsProps {
  stops: PlannedStop[];
  onChange: (stops: PlannedStop[]) => void;
  /** Encoded route polyline; absent until start and destination are both set. */
  encodedPolyline?: string;
}

export function PlannedStops({
  stops,
  onChange,
  encodedPolyline,
}: PlannedStopsProps) {
  const { colors } = useTheme();
  const [activeType, setActiveType] = useState<StopType>("fuel");
  const [requestedTypes, setRequestedTypes] = useState<StopType[]>([]);

  /**
   * The route suggestions were last requested against. Held separately from
   * the live route so that adding a stop — which changes the route — does not
   * silently trigger another billable lookup. Tapping a category refreshes it.
   */
  const [suggestionPolyline, setSuggestionPolyline] = useState<
    string | undefined
  >(undefined);

  // Prefetch fuel once, when the route first exists and nothing is planned yet.
  // Food and photo stay unfetched until the host actually asks for them.
  useEffect(() => {
    if (!encodedPolyline || suggestionPolyline || stops.length > 0) return;
    setSuggestionPolyline(encodedPolyline);
    setRequestedTypes(["fuel"]);
  }, [encodedPolyline, suggestionPolyline, stops.length]);

  const handleSelectType = (type: StopType) => {
    setActiveType(type);
    setSuggestionPolyline(encodedPolyline);
    setRequestedTypes((previous) =>
      previous.includes(type) ? previous : [...previous, type],
    );
  };

  const {
    data,
    isFetching,
    isError,
  } = useStopSuggestions(
    activeType,
    suggestionPolyline,
    requestedTypes.includes(activeType),
  );

  const addedPlaceIds = new Set(
    stops.map((stop) => stop.google_place_id).filter(Boolean),
  );

  const handleAddSuggestion = (suggestion: StopSuggestion) => {
    onChange(
      insertStopInRouteOrder(stops, {
        type: activeType,
        location_coords: suggestion.coords,
        name: suggestion.name,
        address: suggestion.address,
        google_place_id: suggestion.google_place_id,
        distance_along_route_m: suggestion.distance_along_route_m,
      }),
    );
  };

  const handleAddManual = (result: { coords: [number, number]; name: string }) => {
    onChange(
      insertStopInRouteOrder(stops, {
        type: activeType,
        location_coords: result.coords,
        name: result.name,
      }),
    );
  };

  const removeStop = (index: number) => {
    onChange(stops.filter((_, i) => i !== index));
  };

  const suggestions = data?.suggestions ?? [];
  const isDegraded = Boolean(data?.degraded) || isError;
  const hasRoute = Boolean(encodedPolyline);

  const renderSuggestionState = () => {
    if (!hasRoute) {
      return (
        <Text
          className="text-xs text-center py-3"
          style={{ color: colors.textMuted }}
        >
          Set your start point and destination to see {STOP_LABELS[activeType].toLowerCase()} stops along the way.
        </Text>
      );
    }

    if (isFetching) {
      return (
        <View className="py-4 items-center" accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text className="text-xs mt-2" style={{ color: colors.textMuted }}>
            Finding {STOP_LABELS[activeType].toLowerCase()} stops along your route...
          </Text>
        </View>
      );
    }

    if (isDegraded) {
      return (
        <Text
          className="text-xs text-center py-3"
          style={{ color: colors.textMuted }}
          accessibilityLiveRegion="polite"
        >
          Couldn't load suggestions right now — search manually below instead.
        </Text>
      );
    }

    if (!requestedTypes.includes(activeType)) {
      return (
        <TouchableOpacity
          onPress={() => handleSelectType(activeType)}
          accessibilityRole="button"
          accessibilityLabel={`Find ${STOP_LABELS[activeType]} stops along the route`}
          className="py-3 items-center"
          style={{ minHeight: 44 }}
        >
          <Text className="text-xs font-bold" style={{ color: colors.primary }}>
            Find {STOP_LABELS[activeType].toLowerCase()} stops along your route
          </Text>
        </TouchableOpacity>
      );
    }

    if (suggestions.length === 0) {
      return (
        <Text
          className="text-xs text-center py-3"
          style={{ color: colors.textMuted }}
        >
          No {STOP_LABELS[activeType].toLowerCase()} stops found along this route.
          Try searching manually below.
        </Text>
      );
    }

    return (
      <View className="mt-1">
        {suggestions.map((suggestion) => (
          <StopSuggestionRow
            key={suggestion.google_place_id}
            suggestion={suggestion}
            type={activeType}
            isAdded={addedPlaceIds.has(suggestion.google_place_id)}
            onAdd={handleAddSuggestion}
          />
        ))}
      </View>
    );
  };

  return (
    <View
      className="mt-2 mb-6 p-4 rounded-2xl"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-bold" style={{ color: colors.text }}>
          Planned Stops
        </Text>

        <View className="flex-row items-center">
          {STOP_TYPES.map((type) => {
            const isActive = activeType === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => handleSelectType(type)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${STOP_LABELS[type]} stops`}
                className="py-1 px-2 rounded-full mr-1"
                style={{
                  backgroundColor: isActive
                    ? colors.primary + "30"
                    : "transparent",
                  borderWidth: 1,
                  borderColor: isActive ? colors.primary : colors.border,
                  minHeight: 32,
                  justifyContent: "center",
                }}
              >
                <Text className="text-xs" style={{ color: colors.text }}>
                  {STOP_ICONS[type]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {renderSuggestionState()}

      {stops.length > 0 && (
        <View className="mt-3">
          <Text
            className="text-xs font-bold mb-2"
            style={{ color: colors.textMuted }}
          >
            ADDED TO THIS RIDE
          </Text>

          {stops.map((stop, index) => (
            <View
              key={stop.google_place_id ?? `${stop.name}-${index}`}
              className="flex-row items-center justify-between py-3 px-3 rounded-xl mb-2"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center flex-1 mr-2">
                <Text className="text-base mr-2">{STOP_ICONS[stop.type]}</Text>
                <View className="flex-1">
                  <Text
                    className="font-bold text-sm"
                    style={{ color: colors.text }}
                    numberOfLines={1}
                  >
                    {stop.name || `${STOP_LABELS[stop.type]} Stop`}
                  </Text>
                  <Text
                    className="text-xs mt-0.5"
                    style={{ color: colors.textMuted }}
                    numberOfLines={1}
                  >
                    {stop.distance_along_route_m !== undefined
                      ? formatDistanceAlong(stop.distance_along_route_m)
                      : stop.address || STOP_LABELS[stop.type]}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => removeStop(index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${stop.name || STOP_LABELS[stop.type]} stop`}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Trash2 color={colors.textMuted} size={16} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Manual search stays available: sometimes the host knows exactly where
          they intend to stop, and no suggestion list will contain it. */}
      <View className="mt-2">
        <LocationPicker
          label={`Add ${STOP_LABELS[activeType].toLowerCase()} stop manually`}
          placeholder={`Search for a ${STOP_LABELS[activeType].toLowerCase()} stop...`}
          color={MANUAL_SEARCH_ACCENT}
          onSelect={handleAddManual}
        />
      </View>
    </View>
  );
}
