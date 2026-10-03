import React, { ReactNode } from "react";
import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface TabHeaderProps {
  title: string;
  rightContent?: ReactNode;
  hideBorder?: boolean;
}

export function TabHeader({ title, rightContent, hideBorder }: TabHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      className='px-4 pt-2 pb-4 flex-row items-center justify-between'
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: hideBorder ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        className='text-xl font-bold flex-1 mr-2'
        style={{ color: colors.text }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View className='flex-row items-center'>
        {rightContent}
      </View>
    </View>
  );
}
