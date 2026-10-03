import React from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { FEATURES } from "../../src/core/features/features";
import { goBackOr } from "../../src/utils/goBack";
import { Ban, ChevronLeft, Flag, UserPlus, UserMinus } from "lucide-react-native";
import { useReport } from "../../src/features/moderation/hooks/useReport";
import { useCurrentRider } from "../../src/services/useCurrentRider";
import { useTheme } from "../../src/theme/ThemeContext";

const fetchRiderProfile = async (id: string) => {
  const { data } = await apiClient.get(`/api/riders/${id}`);
  return data.rider;
};

const followRider = async (id: string) => {
  const { data } = await apiClient.post(`/api/community/riders/${id}/follow`);
  return data;
};

const blockRider = async (id: string) => {
  await apiClient.post(`/api/notifications/blocked/${id}`);
};

const unfollowRider = async (id: string) => {
  const { data } = await apiClient.delete(`/api/community/riders/${id}/follow`);
  return data;
};

export default function RiderProfileScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRider = useCurrentRider().rider;
  const { openReport, reportSheet } = useReport();

  const {
    data: rider,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["rider", id],
    queryFn: () => fetchRiderProfile(id!),
    enabled: !!id,
  });

  const followMutation = useMutation({
    mutationFn: () => followRider(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rider", id] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => unfollowRider(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rider", id] });
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => blockRider(id!),
    onSuccess: () => {
      // Their posts, comments, routes and rides disappear everywhere.
      void queryClient.invalidateQueries();
      goBackOr(router, "/(tabs)/feed");
    },
    onError: () => Alert.alert("Couldn't block", "Check your connection and try again."),
  });

  const confirmBlock = (name: string) =>
    Alert.alert(
      `Block ${name}?`,
      "You won't see each other's posts, comments, routes or rides, and you'll stop following each other. They won't be told. You can unblock them in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => blockMutation.mutate() },
      ],
    );

  if (isLoading) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError || !rider) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <Text className='font-bold mb-4' style={{ color: colors.danger }}>
          Rider not found
        </Text>
        <TouchableOpacity
          onPress={() => goBackOr(router, "/(tabs)/feed")}
          className='p-3 rounded-xl'
        >
          <Text className='font-bold' style={{ color: colors.text }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isMe = currentRider?.id === rider.id;
  const initial = rider.display_name?.charAt(0) || "?";
  const riderHandle =
    rider.username ||
    (typeof rider.display_name === "string"
      ? rider.display_name.trim().toLowerCase().replace(/\s+/g, "")
      : null) ||
    "rider";

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className='px-4 pt-2 pb-4 flex-row items-center'
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TouchableOpacity
          onPress={() => goBackOr(router, "/(tabs)/feed")}
          className='w-10 h-10 items-center justify-center mr-2'
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className='text-xl font-bold' style={{ color: colors.text }}>
          @{riderHandle}
        </Text>
      </SafeAreaView>

      <ScrollView className='flex-1'>
        {/* Profile Header */}
        <View
          className='p-6 items-center'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <View
            className='w-24 h-24 rounded-full items-center justify-center mb-4'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 2,
              borderColor: colors.primary,
              overflow: 'hidden'
            }}
          >
            {rider.profile_picture_url ? (
              <Image 
                source={{ uri: rider.profile_picture_url }} 
                className="w-full h-full" 
                resizeMode="cover" 
              />
            ) : (
              <Text
                className='text-4xl font-bold uppercase'
                style={{ color: colors.text }}
              >
                {initial}
              </Text>
            )}
          </View>
          <Text className='text-2xl font-bold' style={{ color: colors.text }}>
            {rider.display_name}
          </Text>
          <Text className='mt-1' style={{ color: colors.textMuted }}>
            {rider.bio || "This rider prefers to keep their bio a mystery."}
          </Text>

          {!isMe && (
            <TouchableOpacity
              onPress={() =>
                rider.is_following
                  ? unfollowMutation.mutate()
                  : followMutation.mutate()
              }
              disabled={followMutation.isPending || unfollowMutation.isPending}
              className='mt-6 px-6 py-2 rounded-full flex-row items-center shadow-lg'
              style={{
                backgroundColor: rider.is_following
                  ? colors.surface
                  : colors.primary,
                borderWidth: 1,
                borderColor: rider.is_following
                  ? colors.border
                  : colors.primary,
              }}
            >
              {rider.is_following ? (
                <UserMinus size={16} color={colors.textMuted} />
              ) : (
                <UserPlus size={16} color='#ffffff' />
              )}
              <Text
                className='font-bold text-base ml-2'
                style={{
                  color: rider.is_following ? colors.textMuted : "#ffffff",
                }}
              >
                {rider.is_following ? "Unfollow" : "Follow Rider"}
              </Text>
            </TouchableOpacity>
          )}

          {!isMe && (
            <View className='mt-3 flex-row'>
              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => openReport({ type: "rider", id: rider.id, ownerName: rider.display_name || "this rider" })}
                className='px-4 py-2 flex-row items-center'
              >
                <Flag size={14} color={colors.textMuted} />
                <Text className='text-sm ml-1' style={{ color: colors.textMuted }}>
                  Report
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => confirmBlock(rider.display_name || "this rider")}
                disabled={blockMutation.isPending}
                className='px-4 py-2 flex-row items-center'
              >
                <Ban size={14} color={colors.textMuted} />
                <Text className='text-sm ml-1' style={{ color: colors.textMuted }}>
                  {blockMutation.isPending ? "Blocking…" : "Block"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View
            className='flex-row w-full justify-around mt-8 p-4 rounded-2xl'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View className='items-center'>
              <Text
                className='font-bold text-lg'
                style={{ color: colors.text }}
              >
                {rider.total_rides || 0}
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Rides
              </Text>
            </View>
            <View className='items-center'>
              <Text
                className='font-bold text-lg'
                style={{ color: colors.text }}
              >
                {rider.total_distance_km || 0}km
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Distance
              </Text>
            </View>
            <TouchableOpacity
              className='items-center'
              onPress={() =>
                router.push(
                  `/follow-list?riderId=${rider.id}&mode=followers` as any,
                )
              }
            >
              <Text
                className='font-bold text-lg'
                style={{ color: colors.text }}
              >
                {rider.follower_count ?? 0}
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Followers
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className='items-center'
              onPress={() =>
                router.push(
                  `/follow-list?riderId=${rider.id}&mode=following` as any,
                )
              }
            >
              <Text
                className='font-bold text-lg'
                style={{ color: colors.text }}
              >
                {rider.following_count ?? 0}
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Following
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Garage Section */}
        <View
          className='p-5'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text
            className='text-xl font-bold mb-4'
            style={{ color: colors.text }}
          >
            Garage
          </Text>
          {rider.vehicles && rider.vehicles.length > 0 ? (
            rider.vehicles.map((v: any, i: number) => (
              <View
                key={i}
                className='flex-row items-center p-4 rounded-2xl mb-3'
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View className='w-12 h-12 rounded-full items-center justify-center mr-4'>
                  <Text className='text-2xl'>🏍️</Text>
                </View>
                <View>
                  <Text
                    className='font-bold text-lg'
                    style={{ color: colors.text }}
                  >
                    {v.make} {v.model}
                  </Text>
                  <Text style={{ color: colors.textMuted }}>{v.year}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text className='italic' style={{ color: colors.textMuted }}>
              No vehicles added yet
            </Text>
          )}
        </View>

        {/* Badges Section — part of Rank, held back from the beta */}
        {FEATURES.rank && (
          <View className='p-5 mb-10'>
            <Text
              className='text-xl font-bold mb-4'
              style={{ color: colors.text }}
            >
              Badges
            </Text>
            {rider.badges && rider.badges.length > 0 ? (
              <View className='flex-row flex-wrap'>
                {rider.badges.map((b: any, i: number) => (
                  <View
                    key={i}
                    className='p-3 rounded-2xl mr-3 mb-3 items-center w-24'
                    style={{ borderWidth: 1, borderColor: colors.primary + "4D" }}
                  >
                    <Text className='text-2xl mb-1'>{b.icon || "🏅"}</Text>
                    <Text
                      className='text-xs text-center font-bold'
                      style={{ color: colors.text }}
                    >
                      {b.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className='italic' style={{ color: colors.textMuted }}>
                No badges earned yet
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      {reportSheet}
    </View>
  );
}
