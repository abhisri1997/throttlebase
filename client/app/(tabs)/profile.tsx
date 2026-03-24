import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/store/authStore";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { LogOut, Edit2, Settings } from "lucide-react-native";
import { useTheme } from "../../src/theme/ThemeContext";
import { NotificationBell } from "../../src/components/NotificationBell";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const logout = useAuthStore((state) => state.logout);
  const authRider = useAuthStore((state) => state.rider);

  const { data: profileObj, isLoading: profileLoading } = useQuery({
    queryKey: ["rider", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/riders/me");
      return data.rider;
    },
  });

  const { data: badges, isLoading: badgesLoading } = useQuery({
    queryKey: ["badges", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/rewards/badges/me");
      return data;
    },
  });

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  if (profileLoading) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  const displayRider = profileObj || authRider;
  const initial =
    displayRider?.display_name?.charAt(0) ||
    displayRider?.username?.charAt(0) ||
    "?";

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className='px-4 pt-2 pb-4 flex-row items-center justify-between'
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
        edges={["top"]}
      >
        <Text className='text-xl font-bold' style={{ color: colors.text }}>
          My Profile
        </Text>
        <View className='flex-row items-center'>
          <View className='mr-2'>
            <NotificationBell />
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(modals)/settings")}
            className='p-2 mr-2'
          >
            <Settings color={colors.textMuted} size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} className='p-2'>
            <LogOut color={colors.danger} size={24} />
          </TouchableOpacity>
        </View>
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
            }}
          >
            <Text
              className='text-4xl font-bold uppercase'
              style={{ color: colors.text }}
            >
              {initial}
            </Text>
          </View>
          <Text className='text-2xl font-bold' style={{ color: colors.text }}>
            {displayRider?.display_name || displayRider?.username}
          </Text>
          <Text className='mt-1' style={{ color: colors.textMuted }}>
            @{displayRider?.username || "rider"}
          </Text>
          <Text
            className='mt-2 text-center'
            style={{ color: colors.textMuted }}
          >
            {displayRider?.bio ||
              "Update your profile to add a bio and tell other riders about yourself."}
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(modals)/edit-profile")}
            className='mt-6 px-6 py-2 rounded-full flex-row items-center'
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <Edit2 color={colors.textMuted} size={16} />
            <Text className='font-bold ml-2' style={{ color: colors.text }}>
              Edit Profile
            </Text>
          </TouchableOpacity>

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
                {displayRider?.stats?.total_rides ||
                  displayRider?.total_rides ||
                  0}
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
                {displayRider?.stats?.total_distance_km ||
                  displayRider?.total_distance_km ||
                  0}
                km
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Distance
              </Text>
            </View>
            <View className='items-center'>
              <Text
                className='font-bold text-lg'
                style={{ color: colors.text }}
              >
                {displayRider?.stats?.followers || 0}
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Followers
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/ride-history" as any)}
            className='w-full mt-4 p-4 rounded-2xl flex-row items-center justify-between'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View className='flex-row items-center'>
              <Text className='text-2xl mr-3'>🕒</Text>
              <Text
                className='font-bold text-lg'
                style={{ color: colors.text }}
              >
                Ride History
              </Text>
            </View>
            <Text style={{ color: colors.textMuted }}>➔</Text>
          </TouchableOpacity>
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
          {displayRider?.vehicles && displayRider.vehicles.length > 0 ? (
            displayRider.vehicles.map((v: any, i: number) => (
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

        {/* Badges Section */}
        <View className='p-5 mb-10'>
          <Text
            className='text-xl font-bold mb-4'
            style={{ color: colors.text }}
          >
            My Badges
          </Text>
          {badgesLoading ? (
            <ActivityIndicator color={colors.primary} size='small' />
          ) : badges && badges.length > 0 ? (
            <View className='flex-row flex-wrap'>
              {badges.map((b: any, i: number) => (
                <View
                  key={i}
                  className='p-3 rounded-2xl mr-3 mb-3 items-center w-24'
                  style={{ borderWidth: 1, borderColor: colors.primary + "4D" }}
                >
                  <Text className='text-2xl mb-1'>{b.icon || "🏅"}</Text>
                  <Text
                    className='text-xs text-center font-bold px-1'
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
      </ScrollView>
    </View>
  );
}
