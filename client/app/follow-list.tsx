import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../src/api/client";
import { ChevronLeft, UserPlus, UserMinus } from "lucide-react-native";
import { useAuthStore } from "../src/store/authStore";
import { useTheme } from "../src/theme/ThemeContext";
import { usePullToRefresh } from "../src/hooks/usePullToRefresh";

type FollowEntry = {
  id: string;
  display_name: string;
  experience_level: string | null;
  is_following?: boolean;
};

const fetchList = async (
  riderId: string,
  mode: string,
): Promise<FollowEntry[]> => {
  const path =
    mode === "followers"
      ? `/api/community/riders/${riderId}/followers`
      : `/api/community/riders/${riderId}/following`;
  const { data } = await apiClient.get(path);
  return data as FollowEntry[];
};

const followRider = async (id: string) => {
  await apiClient.post(`/api/community/riders/${id}/follow`);
};

const unfollowRider = async (id: string) => {
  await apiClient.delete(`/api/community/riders/${id}/follow`);
};

export default function FollowListScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRider = useAuthStore((state: any) => state.rider);

  const { riderId, mode } = useLocalSearchParams<{
    riderId: string;
    mode: "followers" | "following";
  }>();

  const title = mode === "followers" ? "Followers" : "Following";

  const {
    data: list,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["follow-list", riderId, mode],
    queryFn: () => fetchList(riderId!, mode!),
    enabled: Boolean(riderId && mode),
  });

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refetch();
  });

  // Track local follow state to avoid needing a full refetch after toggle
  const [followState, setFollowState] = React.useState<Record<string, boolean>>(
    {},
  );

  const followMutation = useMutation({
    mutationFn: (targetId: string) => followRider(targetId),
    onMutate: (targetId) => {
      setFollowState((prev) => ({ ...prev, [targetId]: true }));
    },
    onSuccess: async (_, targetId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["follow-list", riderId, mode],
        }),
        queryClient.invalidateQueries({ queryKey: ["rider", riderId] }),
        queryClient.invalidateQueries({ queryKey: ["rider", targetId] }),
        queryClient.invalidateQueries({ queryKey: ["rider", "me"] }),
      ]);
    },
    onError: (_, targetId) => {
      setFollowState((prev) => ({ ...prev, [targetId]: false }));
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (targetId: string) => unfollowRider(targetId),
    onMutate: (targetId) => {
      setFollowState((prev) => ({ ...prev, [targetId]: false }));
    },
    onSuccess: async (_, targetId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["follow-list", riderId, mode],
        }),
        queryClient.invalidateQueries({ queryKey: ["rider", riderId] }),
        queryClient.invalidateQueries({ queryKey: ["rider", targetId] }),
        queryClient.invalidateQueries({ queryKey: ["rider", "me"] }),
      ]);
    },
    onError: (_, targetId) => {
      setFollowState((prev) => ({ ...prev, [targetId]: true }));
    },
  });

  const renderItem = ({ item }: { item: FollowEntry }) => {
    const isMe = item.id === currentRider?.id;
    const isFollowing =
      item.id in followState
        ? followState[item.id]
        : mode === "following"
          ? true
          : Boolean(item.is_following);
    const initial = item.display_name?.charAt(0) || "?";

    return (
      <View
        className='flex-row items-center px-4 py-3'
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <TouchableOpacity
          onPress={() => router.push(`/rider/${item.id}` as any)}
          className='flex-row items-center flex-1'
        >
          <View
            className='w-11 h-11 rounded-full items-center justify-center mr-3'
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
            }}
          >
            <Text
              className='font-bold text-base uppercase'
              style={{ color: colors.text }}
            >
              {initial}
            </Text>
          </View>
          <View className='flex-1'>
            <Text className='font-semibold' style={{ color: colors.text }}>
              {item.display_name}
            </Text>
            {item.experience_level ? (
              <Text
                className='text-xs capitalize'
                style={{ color: colors.textMuted }}
              >
                {item.experience_level}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        {!isMe && (
          <TouchableOpacity
            onPress={() => {
              if (isFollowing) {
                unfollowMutation.mutate(item.id);
              } else {
                followMutation.mutate(item.id);
              }
            }}
            disabled={followMutation.isPending || unfollowMutation.isPending}
            className='flex-row items-center px-3 py-1.5 rounded-full'
            style={{
              backgroundColor: isFollowing ? colors.surface : colors.primary,
              borderWidth: 1,
              borderColor: isFollowing ? colors.border : colors.primary,
            }}
          >
            {isFollowing ? (
              <UserMinus size={14} color={colors.textMuted} />
            ) : (
              <UserPlus size={14} color='#ffffff' />
            )}
            <Text
              className='text-xs font-bold ml-1'
              style={{ color: isFollowing ? colors.textMuted : "#ffffff" }}
            >
              {isFollowing ? "Unfollow" : "Follow"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className='px-4 pt-2 pb-4 flex-row items-center'
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
        edges={["top"]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className='w-10 h-10 items-center justify-center mr-2'
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className='text-xl font-bold' style={{ color: colors.text }}>
          {title}
        </Text>
      </SafeAreaView>

      {isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size='large' color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={list ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View className='p-8 items-center'>
              <Text style={{ color: colors.textMuted }}>
                {mode === "followers"
                  ? "No followers yet."
                  : "Not following anyone yet."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
