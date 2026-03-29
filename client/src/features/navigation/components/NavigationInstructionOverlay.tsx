import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";

type Props = {
  instruction: string;
  distanceToTurnLabel: string;
  etaLabel: string;
  remainingLabel: string;
  statusLabel: "NOT_STARTED" | "ACTIVE" | "COMPLETED";
  topOffset?: number;
};

export function NavigationInstructionOverlay({
  instruction,
  distanceToTurnLabel,
  etaLabel,
  remainingLabel,
  statusLabel,
  topOffset = 0,
}: Props) {
  const { colors } = useTheme();

  return (
    <View
      className='absolute left-0 right-0 px-4'
      style={{ top: topOffset, zIndex: 60, elevation: 60 }}
    >
      <View
        className='rounded-2xl px-4 py-3'
        style={{
          backgroundColor: colors.surface + "F0",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View className='flex-row justify-between items-center'>
          <Text className='text-xs font-semibold' style={{ color: colors.textMuted }}>
            {statusLabel}
          </Text>
          <Text className='text-xs' style={{ color: colors.textMuted }}>
            ETA {etaLabel}
          </Text>
        </View>

        <Text className='mt-2 text-base font-bold' style={{ color: colors.text }} numberOfLines={2}>
          {instruction}
        </Text>

        <View className='flex-row justify-between mt-3'>
          <Text className='text-xs' style={{ color: colors.textMuted }}>
            Next turn {distanceToTurnLabel}
          </Text>
          <Text className='text-xs' style={{ color: colors.textMuted }}>
            Remaining {remainingLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}
