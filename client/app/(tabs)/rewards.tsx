import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { Trophy, Medal, MapPin, Activity } from "lucide-react-native";
import { useTheme } from "../../src/theme/ThemeContext";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { NotificationBell } from "../../src/components/NotificationBell";

const metricByLeaderboardType = {
  distance: "total_distance_km",
  rides: "total_rides",
  badges: "badges_earned",
} as const;

export default function RewardsScreen() {
  const { colors } = useTheme();
  const [leaderboardType, setLeaderboardType] = useState<
    "distance" | "rides" | "badges"
  >("distance");

  const {
    data: leaderboard,
    isLoading: loadingLeaderboard,
    refetch: refetchLeaderboard,
  } = useQuery({
    queryKey: ["leaderboard", leaderboardType],
    queryFn: async () => {
      const metric = metricByLeaderboardType[leaderboardType];
      const { data } = await apiClient.get(
        `/api/rewards/leaderboard?metric=${metric}`,
      );
      return data;
    },
  });

  const {
    data: badges,
    isLoading: loadingBadges,
    refetch: refetchBadges,
  } = useQuery({
    queryKey: ["badges", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/rewards/badges/me");
      return data;
    },
  });

  const {
    data: achievements,
    isLoading: loadingAchievements,
    refetch: refetchAchievements,
  } = useQuery({
    queryKey: ["achievements", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/rewards/achievements/me");
      return data;
    },
  });

  const formatDistance = (distanceKm: number) => {
    if (!Number.isFinite(distanceKm)) {
      return "0";
    }
    return distanceKm
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
  };

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetchLeaderboard(),
      refetchBadges(),
      refetchAchievements(),
    ]);
  }, [refetchAchievements, refetchBadges, refetchLeaderboard]);

  const { refreshing, onRefresh } = usePullToRefresh(handleRefresh);

  const renderLeaderboardCard = (rider: any, index: number) => {
    const totalDistanceKm = Number(rider.total_distance_km ?? 0);
    const totalRides = Number(rider.total_rides ?? 0);
    const badgesEarned = Number(rider.badges_earned ?? 0);
    const value =
      leaderboardType === "distance"
        ? `${formatDistance(totalDistanceKm)} km`
        : leaderboardType === "rides"
          ? `${totalRides} rides`
          : `${badgesEarned} badges`;

    return (
      <View
        key={rider.id}
        className={`flex-row items-center p-4 mb-2 rounded-2xl ${index === 0 ? "bg-amber-500/10" : ""}`}
        style={
          index === 0
            ? { borderWidth: 1, borderColor: "rgba(245,158,11,0.2)" }
            : undefined
        }
      >
        <View className='w-8 items-center justify-center mr-3'>
          <Text
            className='font-bold text-lg'
            style={{
              color:
                index === 0
                  ? "#f59e0b"
                  : index === 1
                    ? "#94a3b8"
                    : index === 2
                      ? "#cd7f32"
                      : colors.textMuted,
            }}
          >
            #{index + 1}
          </Text>
        </View>
        <View className='flex-1'>
          <Text
            className='font-bold'
            style={{ color: index === 0 ? "#f59e0b" : colors.text }}
          >
            {rider.display_name}
          </Text>
        </View>
        <Text className='font-bold' style={{ color: colors.primary }}>
          {value}
        </Text>
      </View>
    );
  };

  const renderProgress = (current: number = 0, threshold: number = 1) => {
    const percentage = Math.min((current / threshold) * 100, 100);
    return (
      <View
        className='h-2 w-full rounded-full overflow-hidden mt-2'
        style={{ backgroundColor: colors.border }}
      >
        <View
          className='h-full'
          style={{ width: `${percentage}%`, backgroundColor: colors.primary }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView
      className='flex-1'
      style={{ backgroundColor: colors.bg }}
      edges={["top"]}
    >
      <View
        className='px-4 py-3 flex-row items-center'
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          className='text-2xl font-bold flex-1'
          style={{ color: colors.text }}
        >
          Rewards & Ranking
        </Text>
        <NotificationBell />
      </View>

      <ScrollView
        className='flex-1'
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* LEADERBOARD */}
        <View className='px-4 pt-6 pb-2'>
          <View className='flex-row items-center justify-between mb-4'>
            <Text className='text-xl font-bold' style={{ color: colors.text }}>
              Global Leaderboard
            </Text>
            <Trophy color='#f59e0b' size={24} />
          </View>

          <View
            className='flex-row rounded-xl p-1 mb-4'
            style={{ backgroundColor: colors.surface }}
          >
            {(["distance", "rides", "badges"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                className='flex-1 items-center justify-center py-2 rounded-lg'
                style={{
                  backgroundColor:
                    leaderboardType === type ? colors.primary : "transparent",
                }}
                onPress={() => setLeaderboardType(type)}
              >
                <Text
                  className='font-bold capitalize'
                  style={{
                    color:
                      leaderboardType === type ? "#ffffff" : colors.textMuted,
                  }}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingLeaderboard ? (
            <ActivityIndicator
              color={colors.primary}
              size='small'
              className='my-8'
            />
          ) : (
            <View>
              {leaderboard
                ?.slice(0, 10)
                .map((r: any, i: number) => renderLeaderboardCard(r, i))}
            </View>
          )}
        </View>

        {/* BADGES */}
        <View
          className='pt-6'
          style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <View className='px-4 flex-row items-center justify-between mb-4'>
            <Text className='text-xl font-bold' style={{ color: colors.text }}>
              My Badges
            </Text>
            <Medal color='#f59e0b' size={24} />
          </View>

          {loadingBadges ? (
            <ActivityIndicator
              color={colors.primary}
              size='small'
              className='my-8'
            />
          ) : badges?.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className='px-4 pb-4'
            >
              {badges.map((b: any) => (
                <View
                  key={b.id}
                  className='p-4 rounded-2xl mr-3 items-center w-32'
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View className='w-16 h-16 bg-amber-500/10 rounded-full items-center justify-center mb-3'>
                    <Trophy color='#f59e0b' size={32} />
                  </View>
                  <Text
                    className='font-bold text-center mb-1 text-sm'
                    style={{ color: colors.text }}
                  >
                    {b.name}
                  </Text>
                  <Text
                    className='text-xs text-center'
                    style={{ color: colors.textMuted }}
                    numberOfLines={2}
                  >
                    {b.description}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View className='px-4 pb-4'>
              <View
                className='p-6 rounded-2xl items-center'
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.border,
                }}
              >
                <Text
                  className='text-center'
                  style={{ color: colors.textMuted }}
                >
                  You haven't earned any badges yet. Complete rides to start
                  unlocking them!
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ACHIEVEMENTS */}
        <View
          className='px-4 pt-6 pb-12'
          style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <View className='flex-row items-center justify-between mb-4'>
            <Text className='text-xl font-bold' style={{ color: colors.text }}>
              Milestones
            </Text>
            <Activity color='#f59e0b' size={24} />
          </View>

          {loadingAchievements ? (
            <ActivityIndicator
              color={colors.primary}
              size='small'
              className='my-8'
            />
          ) : (
            <View>
              {achievements?.map((a: any) => (
                <View
                  key={a.id}
                  className='p-4 rounded-2xl mb-3'
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View className='flex-row justify-between items-center mb-1'>
                    <Text
                      className='font-bold text-base'
                      style={{ color: colors.text }}
                    >
                      {a.name}
                    </Text>
                    <View
                      className='px-2 py-1 rounded'
                      style={{ backgroundColor: colors.primary + "1A" }}
                    >
                      <Text
                        className='text-xs font-bold'
                        style={{ color: colors.primary }}
                      >
                        Tier {a.current_tier || 0}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className='text-xs mb-2'
                    style={{ color: colors.textMuted }}
                  >
                    {a.reward_description ||
                      "Keep riding to unlock this milestone reward."}
                  </Text>
                  <View className='flex-row justify-between items-center mt-2'>
                    <Text
                      className='text-xs font-bold'
                      style={{ color: colors.textMuted }}
                    >
                      {a.current_value || 0}
                    </Text>
                    <Text
                      className='text-xs font-bold'
                      style={{ color: colors.textMuted }}
                    >
                      {a.threshold}
                    </Text>
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
