import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Button = ({
  onPress,
  title,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  className = '',
}: ButtonProps) => {
  const { colors } = useTheme();
  const baseStyle = 'py-3.5 px-6 rounded-xl flex-row justify-center items-center active:opacity-80';
  
  const variantBg = {
    primary: colors.primary,
    secondary: colors.surface,
    outline: 'transparent',
  };

  const variantTextColor = {
    primary: '#ffffff',
    secondary: colors.text,
    outline: colors.primary,
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      className={`${baseStyle} ${(disabled || isLoading) ? 'opacity-50' : ''} ${className}`}
      style={{
        backgroundColor: variantBg[variant],
        ...(variant === 'outline' ? { borderWidth: 2, borderColor: colors.primary } : {}),
      }}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : '#fff'} />
      ) : (
        <Text className="font-bold text-base" style={{ color: variantTextColor[variant] }}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};
