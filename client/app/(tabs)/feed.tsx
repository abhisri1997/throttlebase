import React from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { PostCard } from "../../src/components/PostCard";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";
import { Plus } from "lucide-react-native";
import { useTheme } from "../../src/theme/ThemeContext";
import { NotificationBell } from "../../src/components/NotificationBell";

const fetchFeed = async () => {
  const { data } = await apiClient.get("/api/community/posts");
  return data;
};

export default function FeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { rider } = useAuthStore();

  const {
    data: posts,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["feed"],
    queryFn: fetchFeed,
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) =>
      apiClient.post(`/api/community/posts/${postId}/like`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) =>
      apiClient.delete(`/api/community/posts/${postId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refetch();
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className='flex-1 justify-center items-center'>
          <ActivityIndicator size='large' color={colors.primary} />
        </View>
      );
    }

    if (isError) {
      return (
        <View className='flex-1 justify-center items-center'>
          <Text className='font-bold mb-2' style={{ color: colors.danger }}>
            Error loading feed
          </Text>
          <Text style={{ color: colors.primary }} onPress={() => refetch()}>
            Try Again
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={posts ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isOwner={item.rider_id === rider?.id}
            onAuthorPress={(riderId) => router.push(`/rider/${riderId}` as any)}
            onLike={() => likeMutation.mutate(item.id)}
            onComment={() => router.push(`/post/${item.id}` as any)}
            onEdit={() =>
              router.push({
                pathname: "/(modals)/create-post",
                params: { editId: item.id, defaultContent: item.content },
              } as any)
            }
            onDelete={() => deletePostMutation.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          <View className='flex-1 justify-center items-center p-8'>
            <Text
              className='text-center text-lg'
              style={{ color: colors.textMuted }}
            >
              No posts yet. Follow some riders or share a route to get started!
            </Text>
          </View>
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingVertical: 16,
          paddingBottom: 80,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            title='Refreshing...'
            titleColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView
      className='flex-1 border-t-0'
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
          className='text-2xl font-bold tracking-tight flex-1'
          style={{ color: colors.text }}
        >
          Community Feed
        </Text>
        <NotificationBell />
      </View>
      {renderContent()}

      {/* Floating Action Button */}
      <TouchableOpacity
        onPress={() => router.push("/(modals)/create-post")}
        className='absolute bottom-6 right-5 w-14 h-14 rounded-full items-center justify-center shadow-lg z-50 elevation-5'
        style={{ backgroundColor: colors.primary }}
        activeOpacity={0.8}
      >
        <Plus color='white' size={30} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
