import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  SlidersHorizontal,
} from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { useTheme } from "../../src/theme/ThemeContext";

interface NotificationItem {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

const formatNotificationTime = (value: string): string => {
  const createdAt = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return createdAt.toLocaleDateString();
};

export default function NotificationsModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", { unreadOnly }],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/notifications", {
        params: { unread: unreadOnly ? "true" : "false" },
      });
      return data as NotificationItem[];
    },
  });

  const unreadCountQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/notifications", {
        params: { unread: "true" },
      });
      return (data as NotificationItem[]).length;
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.patch(`/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      await apiClient.patch("/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([
      notificationsQuery.refetch(),
      unreadCountQuery.refetch(),
    ]);
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;

  const emptyTitle = useMemo(() => {
    if (unreadOnly) {
      return "All caught up. No unread notifications.";
    }
    return "No notifications yet.";
  }, [unreadOnly]);

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className='px-4 py-3'
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
        edges={["top"]}
      >
        <View className='flex-row items-center'>
          <TouchableOpacity onPress={() => router.back()} className='p-2 mr-2'>
            <ChevronLeft color={colors.text} size={24} />
          </TouchableOpacity>
          <View className='flex-1'>
            <Text className='text-xl font-bold' style={{ color: colors.text }}>
              Notifications
            </Text>
            <Text style={{ color: colors.textMuted }}>
              {unreadCount} unread
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(modals)/settings")}
            className='w-10 h-10 rounded-full items-center justify-center'
            style={{ backgroundColor: colors.inputBg }}
          >
            <SlidersHorizontal color={colors.textMuted} size={18} />
          </TouchableOpacity>
        </View>

        <View className='flex-row mt-3'>
          <TouchableOpacity
            onPress={() => setUnreadOnly(false)}
            className='px-4 py-2 rounded-full mr-2'
            style={{
              backgroundColor: unreadOnly ? colors.inputBg : colors.primary,
              borderWidth: 1,
              borderColor: unreadOnly ? colors.border : colors.primary,
            }}
          >
            <Text
              className='font-bold text-xs'
              style={{ color: unreadOnly ? colors.text : "#ffffff" }}
            >
              All
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setUnreadOnly(true)}
            className='px-4 py-2 rounded-full mr-2'
            style={{
              backgroundColor: unreadOnly ? colors.primary : colors.inputBg,
              borderWidth: 1,
              borderColor: unreadOnly ? colors.primary : colors.border,
            }}
          >
            <Text
              className='font-bold text-xs'
              style={{ color: unreadOnly ? "#ffffff" : colors.text }}
            >
              Unread
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => markAllAsRead.mutate()}
            disabled={unreadCount === 0 || markAllAsRead.isPending}
            className='ml-auto px-4 py-2 rounded-full flex-row items-center'
            style={{
              backgroundColor:
                unreadCount === 0 ? colors.inputBg : `${colors.primary}22`,
              borderWidth: 1,
              borderColor:
                unreadCount === 0 ? colors.border : `${colors.primary}66`,
            }}
          >
            <CheckCheck color={colors.primary} size={15} />
            <Text
              className='ml-1 font-bold text-xs'
              style={{ color: colors.primary }}
            >
              Mark all
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {notificationsQuery.isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size='large' color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surface}
            />
          }
          ListEmptyComponent={
            <View className='items-center justify-center p-10'>
              <View
                className='w-16 h-16 rounded-full items-center justify-center mb-4'
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Bell color={colors.textMuted} size={26} />
              </View>
              <Text
                className='font-bold text-center mb-2'
                style={{ color: colors.text }}
              >
                {emptyTitle}
              </Text>
              <Text className='text-center' style={{ color: colors.textMuted }}>
                We will show ride updates, mentions, and system alerts here.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isUnread = !item.is_read;

            return (
              <TouchableOpacity
                key={item.id}
                className='px-4 py-4'
                disabled={!isUnread || markAsRead.isPending}
                onPress={() => markAsRead.mutate(item.id)}
                style={{
                  backgroundColor: isUnread ? `${colors.primary}0D` : colors.bg,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View className='flex-row items-center justify-between mb-1'>
                  <Text
                    className='font-bold flex-1 mr-2'
                    style={{ color: colors.text }}
                  >
                    {item.title || "Notification"}
                  </Text>
                  <Text className='text-xs' style={{ color: colors.textMuted }}>
                    {formatNotificationTime(item.created_at)}
                  </Text>
                </View>

                {item.body ? (
                  <Text className='mb-2' style={{ color: colors.textMuted }}>
                    {item.body}
                  </Text>
                ) : null}

                <View className='flex-row items-center justify-between'>
                  <Text
                    className='text-xs uppercase'
                    style={{ color: colors.textMuted }}
                  >
                    {item.type.replace(/_/g, " ")}
                  </Text>
                  {isUnread ? (
                    <Text
                      className='text-xs font-bold'
                      style={{ color: colors.primary }}
                    >
                      Tap to mark read
                    </Text>
                  ) : (
                    <Text
                      className='text-xs'
                      style={{ color: colors.textMuted }}
                    >
                      Read
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
