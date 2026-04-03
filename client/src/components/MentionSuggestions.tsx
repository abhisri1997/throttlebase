import React from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { MentionSuggestion } from "../utils/mentions";

interface MentionSuggestionsProps {
  visible: boolean;
  suggestions: MentionSuggestion[];
  isLoading: boolean;
  onSelect: (suggestion: MentionSuggestion) => void;
}

export const MentionSuggestions = ({
  visible,
  suggestions,
  isLoading,
  onSelect,
}: MentionSuggestionsProps) => {
  const { colors } = useTheme();

  if (!visible) {
    return null;
  }

  return (
    <View
      className='rounded-2xl px-2 py-2'
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {isLoading ? (
        <View className='py-4 items-center'>
          <ActivityIndicator size='small' color={colors.primary} />
        </View>
      ) : suggestions.length > 0 ? (
        suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion.id}
            onPress={() => onSelect(suggestion)}
            className='px-3 py-3 rounded-xl'
            style={{ backgroundColor: colors.surface }}
          >
            <Text className='font-bold' style={{ color: colors.text }}>
              @{suggestion.username}
            </Text>
            <Text className='text-sm' style={{ color: colors.textMuted }}>
              {suggestion.display_name}
              {suggestion.is_following ? ' · Following' : ''}
            </Text>
          </TouchableOpacity>
        ))
      ) : (
        <View className='py-3 px-3'>
          <Text style={{ color: colors.textMuted }}>
            No matching riders found.
          </Text>
        </View>
      )}
    </View>
  );
};