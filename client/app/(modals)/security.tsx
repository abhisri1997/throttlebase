import React from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Clock, Monitor, ShieldCheck, Trash2 } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import { authService } from "../../src/services/auth";
import { getApiErrorMessage } from "../../src/utils/apiError";

/**
 * Account security.
 *
 * Password and two-factor settings used to live here. Neither exists any
 * more: there are no passwords, and a second factor adds nothing when every
 * sign-in already proves control of a Google account or an inbox. What
 * remains is visibility and control — which devices are signed in, and the
 * ability to end any of them.
 */

type SessionRow = {
  id: string;
  family_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};

type ActivityRow = {
  id: string;
  device_fingerprint: string | null;
  ip_address: string | null;
  geo_location: string | null;
  logged_in_at: string;
};

const formatWhen = (iso: string | null): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

/** A user agent is long and mostly noise; the leading product token is the useful part. */
const deviceLabel = (userAgent: string | null): string => {
  if (!userAgent) return "Unknown device";
  return userAgent.split(" ")[0] ?? userAgent.slice(0, 40);
};

export default function SecurityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const sessions = useQuery<SessionRow[]>({
    queryKey: ["security", "sessions"],
    queryFn: async () =>
      (await apiClient.get("/api/security/sessions")).data?.sessions ?? [],
  });

  const activity = useQuery<ActivityRow[]>({
    queryKey: ["security", "login-activity"],
    queryFn: async () =>
      (await apiClient.get("/api/security/login-activity")).data?.activity ?? [],
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/security/sessions/${id}`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["security", "sessions"] }),
    onError: (error: unknown) =>
      Alert.alert("Couldn't sign out that device", getApiErrorMessage(error, "Please try again.")),
  });

  const signOutEverywhere = (): void => {
    Alert.alert(
      "Sign out everywhere?",
      "Every device, including this one, will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out all",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await authService.signOutEverywhere();
              router.replace("/(auth)/sign-in");
            })();
          },
        },
      ],
    );
  };

  const isLoading = sessions.isLoading || activity.isLoading;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className="text-xl font-bold ml-2" style={{ color: colors.text }}>
          Security
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 40 }}>
          <View
            className="rounded-2xl p-4 mb-6 flex-row items-start"
            style={{ backgroundColor: colors.surface }}
          >
            <ShieldCheck color={colors.primary} size={18} />
            <Text className="ml-2 flex-1 text-sm" style={{ color: colors.textMuted }}>
              You sign in with Google or a one-time email code. There is no
              password on this account to lose or reuse.
            </Text>
          </View>

          <Text
            className="text-xs font-semibold uppercase mb-2 ml-1"
            style={{ color: colors.textMuted }}
          >
            Signed-in devices
          </Text>
          <View
            className="rounded-2xl overflow-hidden mb-3"
            style={{ backgroundColor: colors.surface }}
          >
            {sessions.data && sessions.data.length > 0 ? (
              sessions.data.map((session, index) => (
                <View
                  key={session.id}
                  className="px-4 py-3 flex-row items-center justify-between"
                  style={
                    index > 0
                      ? { borderTopWidth: 1, borderTopColor: colors.border }
                      : undefined
                  }
                >
                  <View className="flex-row items-center flex-1 mr-3">
                    <Monitor color={colors.textMuted} size={16} />
                    <View className="ml-2 flex-1">
                      <Text style={{ color: colors.text }}>
                        {deviceLabel(session.user_agent)}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                        {session.ip_address ?? "unknown IP"} · last used{" "}
                        {formatWhen(session.last_used_at ?? session.created_at)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => revokeOne.mutate(session.id)}
                    disabled={revokeOne.isPending}
                    hitSlop={8}
                  >
                    <Trash2 color={colors.danger} size={16} />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text className="px-4 py-4" style={{ color: colors.textMuted }}>
                No other devices are signed in.
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={signOutEverywhere}
            className="rounded-2xl px-4 py-4 mb-6"
            style={{ backgroundColor: colors.surface }}
          >
            <Text style={{ color: colors.danger }}>Sign out everywhere</Text>
          </TouchableOpacity>

          <Text
            className="text-xs font-semibold uppercase mb-2 ml-1"
            style={{ color: colors.textMuted }}
          >
            Recent sign-ins
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            {activity.data && activity.data.length > 0 ? (
              activity.data.map((row, index) => (
                <View
                  key={row.id}
                  className="px-4 py-3 flex-row items-center"
                  style={
                    index > 0
                      ? { borderTopWidth: 1, borderTopColor: colors.border }
                      : undefined
                  }
                >
                  <Clock color={colors.textMuted} size={16} />
                  <View className="ml-2 flex-1">
                    <Text style={{ color: colors.text }}>{formatWhen(row.logged_in_at)}</Text>
                    <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {row.ip_address ?? "unknown IP"}
                      {row.geo_location ? ` · ${row.geo_location}` : ""}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text className="px-4 py-4" style={{ color: colors.textMuted }}>
                No sign-in history yet.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
