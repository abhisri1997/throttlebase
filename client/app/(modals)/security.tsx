import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import {
  ChevronLeft,
  ShieldCheck,
  Clock,
  Monitor,
  Trash2,
} from "lucide-react-native";

type TotpStatus = { enabled: boolean; verified_at: string | null };
type LoginEvent = {
  id: string;
  ip_address: string | null;
  device_fingerprint: string | null;
  geo_location: string | null;
  logged_in_at: string;
};
type Session = {
  id: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
};

export default function SecurityModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  // Local state for 2FA flows
  const [totpToken, setTotpToken] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);

  const { data: totpStatus, isLoading: totpLoading } = useQuery<TotpStatus>({
    queryKey: ["security", "2fa-status"],
    queryFn: async () => (await apiClient.get("/auth/2fa/status")).data,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<{ activity: LoginEvent[] }>({
    queryKey: ["security", "login-activity"],
    queryFn: async () => (await apiClient.get("/api/security/login-activity?limit=10")).data,
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ["security", "sessions"],
    queryFn: async () => (await apiClient.get("/api/security/sessions")).data,
  });

  const setupMutation = useMutation({
    mutationFn: async () => (await apiClient.post("/auth/2fa/setup")).data,
    onSuccess: (data) => {
      setSetupData(data as { secret: string; otpauthUrl: string });
    },
    onError: () => Alert.alert("Error", "Failed to initiate 2FA setup."),
  });

  const verifyMutation = useMutation({
    mutationFn: async (token: string) =>
      apiClient.post("/auth/2fa/verify", { token }),
    onSuccess: () => {
      Alert.alert("Success", "2FA has been enabled.");
      setSetupData(null);
      setTotpToken("");
      void queryClient.invalidateQueries({ queryKey: ["security", "2fa-status"] });
    },
    onError: (e: any) =>
      Alert.alert("Invalid Token", e?.response?.data?.error ?? "Please try again."),
  });

  const disableMutation = useMutation({
    mutationFn: async ({ password, token }: { password: string; token: string }) =>
      apiClient.post("/auth/2fa/disable", { password, token }),
    onSuccess: () => {
      Alert.alert("Disabled", "2FA has been disabled.");
      setDisablePassword("");
      setDisableToken("");
      void queryClient.invalidateQueries({ queryKey: ["security", "2fa-status"] });
    },
    onError: (e: any) =>
      Alert.alert("Error", e?.response?.data?.error ?? "Could not disable 2FA."),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      apiClient.delete(`/api/security/sessions/${sessionId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["security", "sessions"] });
    },
    onError: () => Alert.alert("Error", "Failed to revoke session."),
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => apiClient.delete("/api/security/sessions"),
    onSuccess: () => {
      Alert.alert("Done", "All sessions revoked.");
      void queryClient.invalidateQueries({ queryKey: ["security", "sessions"] });
    },
    onError: () => Alert.alert("Error", "Failed to revoke sessions."),
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const sectionHeader = (label: string, icon: React.ReactNode) => (
    <View className="px-4 flex-row items-center mb-2 mt-6">
      {icon}
      <Text
        className="font-bold uppercase tracking-wider text-xs ml-2"
        style={{ color: colors.textMuted }}
      >
        {label}
      </Text>
    </View>
  );

  const card = (children: React.ReactNode) => (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  );

  if (totpLoading) {
    return (
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <SafeAreaView
        className="px-4 py-3 flex-row items-center"
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
        edges={["top"]}
      >
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className="text-xl font-bold flex-1" style={{ color: colors.text }}>
          Security
        </Text>
      </SafeAreaView>

      <ScrollView className="flex-1" style={{ backgroundColor: colors.bg }}>
        {/* ── 2FA SECTION ── */}
        {sectionHeader(
          "Two-Factor Authentication",
          <ShieldCheck color={colors.primary} size={18} />,
        )}

        {card(
          <View className="px-4 py-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-semibold" style={{ color: colors.text }}>
                Authenticator App (TOTP)
              </Text>
              <View
                className="px-3 py-1 rounded-full"
                style={{
                  backgroundColor: totpStatus?.enabled ? "#16a34a22" : "#dc262622",
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: totpStatus?.enabled ? "#16a34a" : "#dc2626" }}
                >
                  {totpStatus?.enabled ? "ENABLED" : "DISABLED"}
                </Text>
              </View>
            </View>

            {!totpStatus?.enabled && !setupData && (
              <TouchableOpacity
                onPress={() => setupMutation.mutate()}
                disabled={setupMutation.isPending}
                className="py-3 rounded-xl items-center"
                style={{ backgroundColor: colors.primary }}
              >
                {setupMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Set Up 2FA</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Secure setup flow without third-party QR rendering */}
            {setupData && (
              <View>
                <Text className="text-sm mb-2" style={{ color: colors.textMuted }}>
                  Add this account in your authenticator app using the manual key below.
                </Text>
                <View
                  className="py-4 mb-3 rounded-xl"
                  style={{ backgroundColor: colors.bg }}
                >
                  <Text
                    className="text-xs font-mono text-center px-4"
                    style={{ color: colors.textMuted }}
                    selectable
                  >
                    Manual key: {setupData.secret}
                  </Text>
                  <Text
                    className="text-[11px] mt-2 px-4"
                    style={{ color: colors.textMuted }}
                    selectable
                  >
                    Setup URI: {setupData.otpauthUrl}
                  </Text>
                </View>

                <Text className="text-sm mb-1 font-medium" style={{ color: colors.text }}>
                  Enter the 6-digit code from your app:
                </Text>
                <TextInput
                  value={totpToken}
                  onChangeText={setTotpToken}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-widest mb-3"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  onPress={() => verifyMutation.mutate(totpToken)}
                  disabled={totpToken.length !== 6 || verifyMutation.isPending}
                  className="py-3 rounded-xl items-center"
                  style={{
                    backgroundColor: totpToken.length === 6 ? colors.primary : colors.border,
                  }}
                >
                  {verifyMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-bold">Verify & Enable</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSetupData(null)}
                  className="mt-2 py-2 items-center"
                >
                  <Text style={{ color: colors.textMuted }} className="text-sm">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Disable flow */}
            {totpStatus?.enabled && !setupData && (
              <View>
                <Text className="text-sm mb-3" style={{ color: colors.textMuted }}>
                  To disable 2FA, enter your password and current authenticator code.
                </Text>
                <TextInput
                  value={disablePassword}
                  onChangeText={setDisablePassword}
                  placeholder="Password"
                  secureTextEntry
                  className="rounded-xl px-4 py-3 mb-2"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  value={disableToken}
                  onChangeText={setDisableToken}
                  placeholder="6-digit code"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="rounded-xl px-4 py-3 mb-3 text-center font-bold tracking-widest"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      "Disable 2FA",
                      "Are you sure you want to disable two-factor authentication?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Disable",
                          style: "destructive",
                          onPress: () =>
                            disableMutation.mutate({
                              password: disablePassword,
                              token: disableToken,
                            }),
                        },
                      ],
                    )
                  }
                  disabled={
                    !disablePassword ||
                    disableToken.length !== 6 ||
                    disableMutation.isPending
                  }
                  className="py-3 rounded-xl items-center"
                  style={{ backgroundColor: "#dc2626" }}
                >
                  {disableMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-bold">Disable 2FA</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>,
        )}

        {/* ── LOGIN ACTIVITY ── */}
        {sectionHeader("Recent Login Activity", <Clock color={colors.textMuted} size={18} />)}
        {card(
          activityLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (activityData?.activity?.length ?? 0) === 0 ? (
            <Text className="px-4 py-4 text-sm italic" style={{ color: colors.textMuted }}>
              No login activity recorded yet.
            </Text>
          ) : (
            activityData!.activity.map((ev, idx) => (
              <View
                key={ev.id}
                className="px-4 py-3"
                style={
                  idx !== activityData!.activity.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: colors.border }
                    : undefined
                }
              >
                <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                  {formatDate(ev.logged_in_at)}
                </Text>
                <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                  {ev.ip_address ?? "Unknown IP"}{" "}
                  {ev.geo_location ? `• ${ev.geo_location}` : ""}
                </Text>
                {ev.device_fingerprint && (
                  <Text
                    className="text-xs mt-0.5 italic"
                    style={{ color: colors.textMuted }}
                    numberOfLines={1}
                  >
                    {ev.device_fingerprint}
                  </Text>
                )}
              </View>
            ))
          ),
        )}

        {/* ── ACTIVE SESSIONS ── */}
        {sectionHeader("Active Sessions", <Monitor color={colors.textMuted} size={18} />)}
        {card(
          <View>
            {sessionsLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (sessionsData?.sessions?.length ?? 0) === 0 ? (
              <Text className="px-4 py-4 text-sm italic" style={{ color: colors.textMuted }}>
                No active sessions found.
              </Text>
            ) : (
              sessionsData!.sessions.map((s, idx) => (
                <View
                  key={s.id}
                  className="px-4 py-3 flex-row items-center justify-between"
                  style={
                    idx !== sessionsData!.sessions.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: colors.border }
                      : undefined
                  }
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                      {s.ip_address ?? "Unknown device"}
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      Created {formatDate(s.created_at)}
                    </Text>
                    {s.device_info && (
                      <Text
                        className="text-xs mt-0.5 italic"
                        style={{ color: colors.textMuted }}
                        numberOfLines={1}
                      >
                        {s.device_info}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert("Revoke Session", "Revoke this session?", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Revoke",
                          style: "destructive",
                          onPress: () => revokeSessionMutation.mutate(s.id),
                        },
                      ])
                    }
                    disabled={revokeSessionMutation.isPending}
                    className="p-2"
                  >
                    <Trash2 color="#dc2626" size={18} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {(sessionsData?.sessions?.length ?? 0) > 1 && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Revoke All Sessions", "This will revoke all active sessions.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Revoke All",
                      style: "destructive",
                      onPress: () => revokeAllMutation.mutate(),
                    },
                  ])
                }
                disabled={revokeAllMutation.isPending}
                className="mx-4 my-3 py-3 rounded-xl items-center"
                style={{ backgroundColor: "#dc262622" }}
              >
                <Text className="font-bold text-sm" style={{ color: "#dc2626" }}>
                  Revoke All Sessions
                </Text>
              </TouchableOpacity>
            )}
          </View>,
        )}

        <View className="pb-16" />
      </ScrollView>
    </View>
  );
}
