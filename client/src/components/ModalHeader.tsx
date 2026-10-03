import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../theme/ThemeContext";
import { X, ChevronLeft } from "lucide-react-native";
interface ModalHeaderProps {
  title?: string;
  subtitle?: string;
  leftAction?: "cancel" | "close" | "back" | { label: string; onPress: () => void };
  onLeftPress?: () => void;
  rightAction?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: "text" | "pill";
  };
  leftAlignTitle?: boolean;
  rightActionContent?: React.ReactNode;
  noBorder?: boolean;
}

export function ModalHeader({ title, subtitle, leftAction = "cancel", onLeftPress, rightAction, rightActionContent, leftAlignTitle, noBorder }: ModalHeaderProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const handleLeftPress = () => {
    if (onLeftPress) {
      onLeftPress();
      return;
    }
    if (typeof leftAction === "object" && leftAction.onPress) {
      leftAction.onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/"); // Fallback
    }
  };

  const renderLeft = () => {
    if (typeof leftAction === "object") {
      return (
        <Text className='font-bold text-lg' style={{ color: colors.textMuted }}>
          {leftAction.label}
        </Text>
      );
    }

    switch (leftAction) {
      case "back":
        return <ChevronLeft color={colors.text} size={24} />;
      case "close":
        return <X color={colors.textMuted} size={24} />;
      case "cancel":
      default:
        return (
          <Text className='font-bold text-lg' style={{ color: colors.textMuted }}>
            Cancel
          </Text>
        );
    }
  };

  const renderRight = () => {
    if (rightActionContent) {
      return rightActionContent;
    }
    if (!rightAction) {
      // Need a spacer to keep the title centered, unless it's left aligned
      if (leftAlignTitle) return null;
      return <View style={{ width: typeof leftAction === "object" || leftAction === "cancel" ? 55 : 24 }} />;
    }

    const { label, onPress, disabled, loading, variant = "text" } = rightAction;

    if (variant === "pill") {
      return (
        <TouchableOpacity
          onPress={onPress}
          disabled={disabled || loading}
          className='px-4 py-2 rounded-full'
          style={{
            backgroundColor: !disabled ? colors.primary : colors.border,
          }}
        >
          {loading ? (
            <ActivityIndicator size='small' color='white' />
          ) : (
            <Text className='font-bold text-white'>{label}</Text>
          )}
        </TouchableOpacity>
      );
    }

    // Default text variant
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled || loading}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text
            className='font-bold text-lg'
            style={{ color: disabled ? colors.textMuted : colors.primary }}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      className='px-4 pt-4 pb-2 flex-row justify-between items-center'
      style={{
        borderBottomWidth: noBorder ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <TouchableOpacity
        onPress={handleLeftPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{ minWidth: 55 }}
      >
        {renderLeft()}
      </TouchableOpacity>
      
      {title ? (
        <View className={`flex-1 mx-2 ${leftAlignTitle ? 'items-start' : 'items-center'}`}>
          <Text className={`font-bold ${leftAlignTitle ? 'text-xl' : 'text-lg'}`} style={{ color: colors.text }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text className='text-xs' style={{ color: colors.textMuted }} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      ) : <View className="flex-1 mx-2" />}
      
      {(rightAction || rightActionContent || (!leftAlignTitle && !rightAction)) && (
        <View style={{ minWidth: 55, alignItems: "flex-end" }}>
          {renderRight()}
        </View>
      )}
    </View>
  );
}
