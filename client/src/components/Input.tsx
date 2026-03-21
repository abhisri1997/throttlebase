import React from 'react';
import { TextInput, View, Text, TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export const Input = ({ label, error, className = '', ...props }: InputProps) => {
  const { colors } = useTheme();

  return (
    <View className={`mb-4 ${className}`}>
      <Text className="text-sm font-medium mb-1.5 ml-1" style={{ color: colors.text }}>{label}</Text>
      <TextInput
        className="px-4 py-3.5 rounded-xl font-medium"
        style={{
          backgroundColor: colors.inputBg,
          borderWidth: 1,
          borderColor: error ? '#ef4444' : colors.border,
          color: colors.text,
        }}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
      {error && <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text>}
    </View>
  );
};
