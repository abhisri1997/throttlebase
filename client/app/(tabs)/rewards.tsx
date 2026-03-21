import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../src/api/client';
import { Trophy, Medal, MapPin, Activity } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeContext';

export default function RewardsScreen() {
  const { colors } = useTheme();
  const [leaderboardType, setLeaderboardType] = useState<'distance' | 'rides' | 'badges'>('distance');

  const { data: leaderboard, isLoading: loadingLeaderboard } = useQuery({
    queryKey: ['leaderboard', leaderboardType],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/rewards/leaderboard?type=${leaderboardType}`);
      return data;
    }
  });

  const { data: badges, isLoading: loadingBadges } = useQuery({
    queryKey: ['badges', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/rewards/badges/me');
      return data;
    }
  });

  const { data: achievements, isLoading: loadingAchievements } = useQuery({
    queryKey: ['achievements', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/rewards/achievements/me');
      return data;
    }
  });

  const renderLeaderboardCard = (rider: any, index: number) => {
    const value =
      leaderboardType === 'distance' ? `${(rider.total_distance || 0).toFixed(0)} km` :
      leaderboardType === 'rides' ? `${rider.total_rides || 0} rides` :
      `${rider.badges_count || 0} badges`;

    return (
      <View
        key={rider.id}
        className={`flex-row items-center p-4 mb-2 rounded-2xl ${index === 0 ? 'bg-amber-500/10' : ''}`}
        style={index === 0 ? { borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' } : undefined}
      >
        <View className="w-8 items-center justify-center mr-3">
          <Text
            className="font-bold text-lg"
            style={{ color: index === 0 ? '#f59e0b' : index === 1 ? '#94a3b8' : index === 2 ? '#cd7f32' : colors.textMuted }}
          >
            #{index + 1}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-bold" style={{ color: index === 0 ? '#f59e0b' : colors.text }}>
            {rider.display_name}
          </Text>
        </View>
        <Text className="font-bold" style={{ color: colors.primary }}>{value}</Text>
      </View>
    );
  };

  const renderProgress = (current: number = 0, threshold: number = 1) => {
    const percentage = Math.min((current / threshold) * 100, 100);
    return (
      <View className="h-2 w-full rounded-full overflow-hidden mt-2" style={{ backgroundColor: colors.border }}>
        <View className="h-full" style={{ width: `${percentage}%`, backgroundColor: colors.primary }} />
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View
        className="px-4 py-3"
        style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Text className="text-2xl font-bold" style={{ color: colors.text }}>Rewards & Ranking</Text>
      </View>

      <ScrollView className="flex-1">
        {/* LEADERBOARD */}
        <View className="px-4 pt-6 pb-2">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>Global Leaderboard</Text>
            <Trophy color="#f59e0b" size={24} />
          </View>

          <View className="flex-row rounded-xl p-1 mb-4" style={{ backgroundColor: colors.surface }}>
            {(['distance', 'rides', 'badges'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                className="flex-1 items-center justify-center py-2 rounded-lg"
                style={{ backgroundColor: leaderboardType === type ? colors.primary : 'transparent' }}
                onPress={() => setLeaderboardType(type)}
              >
                <Text
                  className="font-bold capitalize"
                  style={{ color: leaderboardType === type ? '#ffffff' : colors.textMuted }}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingLeaderboard ? (
            <ActivityIndicator color={colors.primary} size="small" className="my-8" />
          ) : (
            <View>
              {leaderboard?.slice(0, 10).map((r: any, i: number) => renderLeaderboardCard(r, i))}
            </View>
          )}
        </View>

        {/* BADGES */}
        <View className="pt-6" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          <View className="px-4 flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>My Badges</Text>
            <Medal color="#f59e0b" size={24} />
          </View>

          {loadingBadges ? (
            <ActivityIndicator color={colors.primary} size="small" className="my-8" />
          ) : badges?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-4">
              {badges.map((b: any) => (
                <View
                  key={b.id}
                  className="p-4 rounded-2xl mr-3 items-center w-32"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <View className="w-16 h-16 bg-amber-500/10 rounded-full items-center justify-center mb-3">
                    <Trophy color="#f59e0b" size={32} />
                  </View>
                  <Text className="font-bold text-center mb-1 text-sm" style={{ color: colors.text }}>{b.name}</Text>
                  <Text className="text-xs text-center" style={{ color: colors.textMuted }} numberOfLines={2}>{b.description}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View className="px-4 pb-4">
              <View className="p-6 rounded-2xl items-center"
                style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}
              >
                <Text className="text-center" style={{ color: colors.textMuted }}>
                  You haven't earned any badges yet. Complete rides to start unlocking them!
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ACHIEVEMENTS */}
        <View className="px-4 pt-6 pb-12" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>Milestones</Text>
            <Activity color="#f59e0b" size={24} />
          </View>

          {loadingAchievements ? (
            <ActivityIndicator color={colors.primary} size="small" className="my-8" />
          ) : (
            <View>
              {achievements?.map((a: any) => (
                <View key={a.id} className="p-4 rounded-2xl mb-3"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-bold text-base" style={{ color: colors.text }}>{a.name}</Text>
                    <View className="px-2 py-1 rounded" style={{ backgroundColor: colors.primary + '1A' }}>
                      <Text className="text-xs font-bold" style={{ color: colors.primary }}>Tier {a.current_tier || 0}</Text>
                    </View>
                  </View>
                  <Text className="text-xs mb-2" style={{ color: colors.textMuted }}>{a.description}</Text>
                  <View className="flex-row justify-between items-center mt-2">
                    <Text className="text-xs font-bold" style={{ color: colors.textMuted }}>{a.current_value || 0}</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.textMuted }}>{a.threshold}</Text>
                  </View>
                  {renderProgress(a.current_value, a.threshold)}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
