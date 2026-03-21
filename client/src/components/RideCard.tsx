import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Calendar, Users, MapPin, Gauge } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

interface RideCardProps {
  ride: {
    id: string;
    title: string;
    scheduled_at: string;
    max_capacity: number;
    current_rider_count: number;
    estimated_duration_min: number;
    difficulty_level?: number;
    status: string;
  };
  onPress?: () => void;
}

export const RideCard = ({ ride, onPress }: RideCardProps) => {
  const { colors } = useTheme();
  const dateStr = new Date(ride.scheduled_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="p-5 rounded-3xl mx-4 mb-4 shadow-md"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <View className="flex-row justify-between items-start mb-3">
        <Text className="flex-1 text-xl font-bold mr-2" style={{ color: colors.text }} numberOfLines={1}>
          {ride.title}
        </Text>
        <View className="bg-primary-500/20 px-3 py-1 rounded-full">
          <Text className="text-primary-500 text-xs font-bold uppercase">{ride.status}</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap mb-4">
        <View className="flex-row items-center w-1/2 mb-3">
          <Calendar color={colors.textMuted} size={16} className="mr-2" />
          <Text className="text-sm" style={{ color: colors.textMuted }}>{dateStr}</Text>
        </View>
        <View className="flex-row items-center w-1/2 mb-3">
          <Users color={colors.textMuted} size={16} className="mr-2" />
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            {ride.current_rider_count} {ride.max_capacity ? `/ ${ride.max_capacity} ` : ''}Joined
          </Text>
        </View>
        <View className="flex-row items-center w-1/2">
          <Gauge color={colors.textMuted} size={16} className="mr-2" />
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            {Math.round(ride.estimated_duration_min / 60)}h Duration
          </Text>
        </View>
        <View className="flex-row items-center w-1/2">
          <MapPin color={colors.textMuted} size={16} className="mr-2" />
          <Text className="text-sm" style={{ color: colors.textMuted }}>Tap for Route</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
