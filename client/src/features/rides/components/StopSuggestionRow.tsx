import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Check, Plus } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import {
  formatDetour,
  formatDistanceAlong,
  STOP_ICONS,
  type StopSuggestion,
  type StopType,
} from "../types/stops";

interface StopSuggestionRowProps {
  suggestion: StopSuggestion;
  type: StopType;
  isAdded: boolean;
  onAdd: (suggestion: StopSuggestion) => void;
}

export function StopSuggestionRow({
  suggestion,
  type,
  isAdded,
  onAdd,
}: StopSuggestionRowProps) {
  const { colors } = useTheme();

  const positionLabel = `${formatDistanceAlong(
    suggestion.distance_along_route_m,
  )} · ${formatDetour(suggestion.detour_from_route_m)}`;

  return (
    <TouchableOpacity
      onPress={() => onAdd(suggestion)}
      disabled={isAdded}
      accessibilityRole="button"
      accessibilityState={{ disabled: isAdded }}
      accessibilityLabel={
        isAdded
          ? `${suggestion.name}, already added`
          : `Add ${suggestion.name}, ${positionLabel}`
      }
      className="flex-row items-center py-3 px-3 rounded-xl mb-2"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: isAdded ? colors.primary : colors.border,
        opacity: isAdded ? 0.6 : 1,
        minHeight: 44,
      }}
    >
      <Text className="text-base mr-2">{STOP_ICONS[type]}</Text>

      <View className="flex-1 mr-2">
        <Text
          className="font-bold text-sm"
          style={{ color: colors.text }}
          numberOfLines={1}
        >
          {suggestion.name}
        </Text>
        <Text
          className="text-xs mt-0.5"
          style={{ color: colors.textMuted }}
          numberOfLines={1}
        >
          {positionLabel}
        </Text>
      </View>

      {isAdded ? (
        <Check color={colors.primary} size={18} />
      ) : (
        <Plus color={colors.textMuted} size={18} />
      )}
    </TouchableOpacity>
  );
}
