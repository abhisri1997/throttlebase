import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import {
  Bell,
  ChevronLeft,
  LifeBuoy,
  Shield,
  UserX,
  Settings as SettingsIcon,
  Lock,
} from "lucide-react-native";

export default function SettingsModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark, setTheme } = useTheme();

  const { data: general, isLoading: gLoading } = useQuery({
    queryKey: ["settings", "general"],
    queryFn: async () =>
      (await apiClient.get("/api/notifications/settings")).data,
  });

  const { data: privacy, isLoading: pLoading } = useQuery({
    queryKey: ["settings", "privacy"],
    queryFn: async () =>
      (await apiClient.get("/api/notifications/privacy")).data,
  });

  const { data: blocked, isLoading: bLoading } = useQuery({
    queryKey: ["settings", "blocked"],
    queryFn: async () =>
      (await apiClient.get("/api/notifications/blocked")).data,
  });

  const updateGeneral = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.theme) {
        setTheme(payload.theme);
      }
      return apiClient.patch("/api/notifications/settings", payload);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["settings", "general"] }),
  });

  const updatePrivacy = useMutation({
    mutationFn: async (payload: any) =>
      apiClient.patch("/api/notifications/privacy", payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["settings", "privacy"] }),
  });

  const unblockRider = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/api/notifications/blocked/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["settings", "blocked"] }),
  });

  const renderCycler = (
    label: string,
    value: string,
    options: string[],
    onChange: (val: string) => void,
  ) => (
    <View
      className='flex-row justify-between items-center py-4 mx-4'
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Text style={{ color: colors.text }} className='text-base font-medium'>
        {label}
      </Text>
      <View
        className='flex-row rounded-lg p-1'
        style={{ backgroundColor: colors.surface }}
      >
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            className='px-3 py-1.5 rounded'
            style={{
              backgroundColor: value === opt ? colors.primary : "transparent",
            }}
          >
            <Text
              className='capitalize font-bold text-xs'
              style={{
                color: value === opt ? "#ffffff" : colors.textMuted,
              }}
            >
              {opt.replace("_", " ")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderToggle = (
    label: string,
    value: boolean,
    onChange: (val: boolean) => void,
  ) => (
    <View
      className='flex-row justify-between items-center py-4 mx-4'
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Text style={{ color: colors.text }} className='text-base font-medium'>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor='#ffffff'
      />
    </View>
  );

  if (gLoading || pLoading || bLoading) {
    return (
      <View
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </View>
    );
  }

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className='px-4 py-3 flex-row items-center'
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
        edges={["top"]}
      >
        <TouchableOpacity onPress={() => router.back()} className='p-2 mr-2'>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text
          className='text-xl font-bold flex-1'
          style={{ color: colors.text }}
        >
          App Settings
        </Text>
      </SafeAreaView>

      <ScrollView className='flex-1' style={{ backgroundColor: colors.bg }}>
        {/* GENERAL SETTINGS */}
        <View className='pt-6 pb-2'>
          <View className='px-4 flex-row items-center mb-2'>
            <SettingsIcon color={colors.textMuted} size={18} />
            <Text
              className='font-bold uppercase tracking-wider text-xs ml-2'
              style={{ color: colors.textMuted }}
            >
              General Options
            </Text>
          </View>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            {renderCycler(
              "Distance Unit",
              general?.distance_unit || "km",
              ["km", "mi"],
              (val) => updateGeneral.mutate({ distance_unit: val }),
            )}
            {renderCycler(
              "Speed Unit",
              general?.speed_unit || "kmh",
              ["kmh", "mph"],
              (val) => updateGeneral.mutate({ speed_unit: val }),
            )}
            {renderCycler(
              "Theme Preferences",
              isDark ? "dark" : "light",
              ["dark", "light"],
              (val) => updateGeneral.mutate({ theme: val }),
            )}
            <TouchableOpacity
              onPress={() => router.push("/(modals)/notifications")}
              className='mx-4 py-4 flex-row items-center justify-between'
            >
              <View className='flex-row items-center'>
                <Bell color={colors.textMuted} size={16} />
                <Text
                  className='ml-2 text-base font-medium'
                  style={{ color: colors.text }}
                >
                  Notification Center
                </Text>
              </View>
              <Text style={{ color: colors.textMuted }}>➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PRIVACY SETTINGS */}
        <View className='pt-6 pb-2'>
          <View className='px-4 flex-row items-center mb-2'>
            <Shield color={colors.textMuted} size={18} />
            <Text
              className='font-bold uppercase tracking-wider text-xs ml-2'
              style={{ color: colors.textMuted }}
            >
              Security & Privacy
            </Text>
          </View>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            {renderCycler(
              "Profile Visibility",
              privacy?.profile_visibility || "public",
              ["public", "riders_only", "private"],
              (val) => updatePrivacy.mutate({ profile_visibility: val }),
            )}
            {renderCycler(
              "Ride History Logs",
              privacy?.ride_history_visibility || "public",
              ["public", "riders_only", "private"],
              (val) => updatePrivacy.mutate({ ride_history_visibility: val }),
            )}
            {renderCycler(
              "Invite Permissions",
              privacy?.invite_permission || "everyone",
              ["everyone", "followers_only", "no_one"],
              (val) => updatePrivacy.mutate({ invite_permission: val }),
            )}
            {renderToggle(
              "Global Leaderboard Opt-In",
              privacy?.leaderboard_opt_in ?? true,
              (val) => updatePrivacy.mutate({ leaderboard_opt_in: val }),
            )}
            <TouchableOpacity
              onPress={() => router.push("/(modals)/security")}
              className='mx-4 py-4 flex-row items-center justify-between'
            >
              <View className='flex-row items-center'>
                <Lock color={colors.textMuted} size={16} />
                <Text
                  className='ml-2 text-base font-medium'
                  style={{ color: colors.text }}
                >
                  2FA &amp; Session Security
                </Text>
              </View>
              <Text style={{ color: colors.textMuted }}>➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* BLOCKED USERS */}
        <View className='pt-6 pb-12'>
          <View className='px-4 flex-row items-center mb-2'>
            <UserX color={colors.danger} size={18} />
            <Text
              className='font-bold uppercase tracking-wider text-xs ml-2'
              style={{ color: colors.danger }}
            >
              Blocked Riders
            </Text>
          </View>
          <View
            className='py-2 min-h-[100px] justify-center'
            style={{
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            {blocked?.length > 0 ? (
              blocked.map((block: any, index: number) => (
                <View
                  key={block.blocked_id}
                  className='flex-row items-center justify-between px-4 py-3'
                  style={
                    index !== blocked.length - 1
                      ? {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        }
                      : undefined
                  }
                >
                  <Text className='font-bold' style={{ color: colors.text }}>
                    {block.blocked_name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => unblockRider.mutate(block.blocked_id)}
                    className='px-4 py-2 rounded-full'
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className='font-bold text-sm'
                      style={{ color: colors.text }}
                    >
                      Unblock
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text
                className='italic text-center text-sm px-4'
                style={{ color: colors.textMuted }}
              >
                You have not blocked any riders. Blocked riders will completely
                disappear from your App views.
              </Text>
            )}
          </View>
        </View>

        <View className='pb-12'>
          <View className='px-4 flex-row items-center mb-2'>
            <LifeBuoy color={colors.primary} size={18} />
            <Text
              className='font-bold uppercase tracking-wider text-xs ml-2'
              style={{ color: colors.textMuted }}
            >
              Support
            </Text>
          </View>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={() => router.push("/(modals)/support")}
              className='px-4 py-4 flex-row items-center justify-between'
            >
              <View>
                <Text
                  className='text-base font-medium'
                  style={{ color: colors.text }}
                >
                  Contact Support
                </Text>
                <Text
                  className='text-sm mt-1'
                  style={{ color: colors.textMuted }}
                >
                  Report bugs, disputes, account issues, or general questions.
                </Text>
              </View>
              <Text style={{ color: colors.textMuted }}>➔</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
