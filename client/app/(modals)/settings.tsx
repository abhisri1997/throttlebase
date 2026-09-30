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
import { useCurrentRider } from "../../src/services/useCurrentRider";
import { isAdmin } from "../../src/core/auth/roles";
import { FEATURES } from "../../src/core/features/features";
import type { ReactNode } from "react";
import { Bell, ChevronLeft, FileText, LifeBuoy, Lock, Settings as SettingsIcon, Shield, Trash2, User, UserX } from "lucide-react-native";

const LEGAL_LINKS = [
  { path: "/privacy", label: "Privacy Policy" },
  { path: "/terms", label: "Terms of Use" },
  { path: "/grievance", label: "Grievance Officer" },
  { path: "/(modals)/my-reports", label: "Your reports" },
] as const;

interface SectionHeaderProps {
  icon: ReactNode;
  label: string;
  color: string;
}

/**
 * The label takes the rest of the row (flex-1) rather than its own measured
 * width: on Android that measurement came out too narrow for the bold,
 * letter-spaced capitals, so "Security & Privacy" wrapped onto a line with
 * no room and showed as "SECURITY &".
 */
function SectionHeader({ icon, label, color }: SectionHeaderProps) {
  return (
    <View className='px-4 flex-row items-center mb-2'>
      {icon}
      <Text className='flex-1 font-bold uppercase tracking-wider text-xs ml-2' style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

export default function SettingsModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark, setTheme } = useTheme();
  const rider = useCurrentRider().rider;

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
    // Their posts, routes and rides show again everywhere.
    onSuccess: () => queryClient.invalidateQueries(),
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

  /**
   * Account deletion, which the app stores require to be reachable in-app.
   * The page explains what goes and what stays, and confirms with a code
   * emailed to the rider; it is also throttlebase.in/delete-account.
   */
  const handleDeleteAccount = (): void => {
    router.push("/delete-account");
  };

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
          <SectionHeader
            icon={<SettingsIcon color={colors.textMuted} size={18} />}
            label='General Options'
            color={colors.textMuted}
          />
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
          <SectionHeader
            icon={<Shield color={colors.textMuted} size={18} />}
            label='Security & Privacy'
            color={colors.textMuted}
          />
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
            {FEATURES.rank &&
              renderToggle(
                "Global Leaderboard Opt-In",
                privacy?.leaderboard_opt_in ?? true,
                (val) => updatePrivacy.mutate({ leaderboard_opt_in: val }),
              )}
            {FEATURES.accountSecurity && (
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
                    Devices &amp; Sign-in Activity
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted }}>➔</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* BLOCKED USERS */}
        <View className='pt-6 pb-12'>
          <SectionHeader
            icon={<UserX color={colors.danger} size={18} />}
            label='Blocked Riders'
            color={colors.danger}
          />
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

        {FEATURES.support && (
          <View className='pb-12'>
            <SectionHeader
              icon={<LifeBuoy color={colors.primary} size={18} />}
              label='Support'
              color={colors.textMuted}
            />
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
              {isAdmin(rider?.roles) ? (
                <TouchableOpacity
                  onPress={() => router.push("/(modals)/support-admin")}
                  className='px-4 py-4 flex-row items-center justify-between'
                  style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <View className='flex-row items-center'>
                    <Shield color={colors.primary} size={16} />
                    <View className='ml-2'>
                      <Text
                        className='text-base font-medium'
                        style={{ color: colors.primary }}
                      >
                        Admin — Manage Tickets
                      </Text>
                      <Text
                        className='text-sm mt-0.5'
                        style={{ color: colors.textMuted }}
                      >
                        View and update all support tickets.
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.textMuted }}>➔</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {isAdmin(rider?.roles) ? (
          <View className='pb-6'>
            <SectionHeader
              icon={<Shield color={colors.primary} size={18} />}
              label='Admin'
              color={colors.primary}
            />
            <View
              style={{
                backgroundColor: colors.surface,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => router.push("/(modals)/moderation")}
                className='px-4 py-4 flex-row items-center justify-between'
              >
                <View>
                  <Text className='text-base font-medium' style={{ color: colors.text }}>
                    Moderation
                  </Text>
                  <Text className='text-sm mt-1' style={{ color: colors.textMuted }}>
                    Review reports, remove content, suspend riders.
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted }}>➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View className='pb-12'>
          <SectionHeader
            icon={<User color={colors.textMuted} size={18} />}
            label='Account'
            color={colors.textMuted}
          />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={handleDeleteAccount}
              className='px-4 py-4 flex-row items-center justify-between'
            >
              <View className='flex-row items-center'>
                <Trash2 color={colors.danger} size={16} />
                <View className='ml-2'>
                  <Text
                    className='text-base font-medium'
                    style={{ color: colors.danger }}
                  >
                    Delete account
                  </Text>
                  <Text
                    className='text-sm mt-0.5'
                    style={{ color: colors.textMuted }}
                  >
                    Removes your sign-in methods and signs out every device.
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.textMuted }}>➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className='pb-12'>
          <SectionHeader
            icon={<FileText color={colors.textMuted} size={18} />}
            label='Legal'
            color={colors.textMuted}
          />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            {LEGAL_LINKS.map((link, index) => (
              <TouchableOpacity
                key={link.path}
                onPress={() => router.push(link.path)}
                className='px-4 py-4 flex-row items-center justify-between'
                style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
                accessibilityRole='link'
              >
                <Text className='text-base font-medium' style={{ color: colors.text }}>
                  {link.label}
                </Text>
                <Text style={{ color: colors.textMuted }}>➔</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
