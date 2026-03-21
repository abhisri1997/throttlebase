import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Map, Eye, Navigation } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

interface RouteCardProps {
  routeData: {
    id: string;
    title: string;
    distance_km?: number;
    visibility: string;
    geojson?: any;
    created_at: string;
  };
  onPress?: () => void;
}

export const RouteCard = ({ routeData, onPress }: RouteCardProps) => {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="p-5 rounded-3xl mx-4 mb-4 shadow-md"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <View className="flex-row mb-4">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mr-4"
          style={{ backgroundColor: colors.primary + '1A' }}
        >
          <Map color={colors.primary} size={32} />
        </View>
        <View className="flex-1 justify-center">
          <Text className="text-xl font-bold mb-1" style={{ color: colors.text }} numberOfLines={1}>
            {routeData.title}
          </Text>
          <View className="flex-row items-center">
            <Eye color={colors.textMuted} size={14} className="mr-1.5" />
            <Text className="text-xs uppercase font-medium mr-4" style={{ color: colors.textMuted }}>
              {routeData.visibility}
            </Text>
            <Navigation color={colors.textMuted} size={14} className="mr-1.5" />
            <Text className="font-bold ml-2" style={{ color: colors.primary }}>Preview Map</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};
