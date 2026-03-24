import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { apiClient } from "../api/client";
import { useTheme } from "../theme/ThemeContext";

type NotificationBellProps = {
  className?: string;
};

export function NotificationBell({ className }: NotificationBellProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: unreadNotifications = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/notifications", {
        params: { unread: "true" },
      });
      return Array.isArray(data) ? data.length : 0;
    },
  });

  return (
    <TouchableOpacity
      onPress={() => router.push("/(modals)/notifications")}
      className={
        className || "w-11 h-11 rounded-full items-center justify-center"
      }
      style={{ backgroundColor: colors.inputBg }}
    >
      <Bell color={colors.textMuted} size={20} />
      {unreadNotifications > 0 ? (
        <View
          className='absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full'
          style={{ backgroundColor: colors.danger }}
        >
          <Text className='text-[10px] font-bold text-white'>
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
