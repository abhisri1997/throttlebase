import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Shield, Users } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { useTheme } from "../../src/theme/ThemeContext";

type GroupMember = {
  rider_id: string;
  display_name: string;
  role: "admin" | "member";
  joined_at: string;
};

type GroupDetail = {
  id: string;
  name: string;
  description?: string | null;
  visibility: "public" | "private";
  creator_name: string;
  member_count: number;
  is_member: boolean;
  current_user_role?: "admin" | "member" | null;
  members: GroupMember[];
};

const fetchGroupDetail = async (id: string): Promise<GroupDetail> => {
  const { data } = await apiClient.get(`/api/community/groups/${id}`);
  return data;
};

export default function GroupDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    id?: string | string[];
    "[id]"?: string | string[];
  }>();
  const rawId = params.id ?? params["[id]"];
  const groupId = Array.isArray(rawId) ? rawId[0] : rawId;
  const normalizedGroupId = groupId?.trim() || "";

  const {
    data: group,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["group", normalizedGroupId],
    queryFn: () => fetchGroupDetail(normalizedGroupId),
    enabled: Boolean(normalizedGroupId),
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/api/community/groups/${normalizedGroupId}/join`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group", normalizedGroupId] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err.response?.data?.error || "Failed to join group");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete(
        `/api/community/groups/${normalizedGroupId}/leave`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group", normalizedGroupId] });
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        err.response?.data?.error || "Failed to leave group",
      );
    },
  });

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refetch();
  });

  if (!normalizedGroupId) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center px-6'
        style={{ backgroundColor: colors.bg }}
      >
        <Text className='font-bold mb-2' style={{ color: colors.danger }}>
          Invalid group link.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

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

  if (isError || !group) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center px-6'
        style={{ backgroundColor: colors.bg }}
      >
        <Text className='font-bold mb-2' style={{ color: colors.danger }}>
          Failed to load group.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const canLeave = group.is_member && group.current_user_role !== "admin";
  const ctaPending = joinMutation.isPending || leaveMutation.isPending;

  return (
    <SafeAreaView
      className='flex-1'
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
        <TouchableOpacity onPress={() => router.back()} className='mr-3'>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text
          className='text-xl font-bold flex-1'
          style={{ color: colors.text }}
        >
          Group Details
        </Text>
      </View>

      <ScrollView
        className='flex-1'
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <View
          className='p-5'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <View className='flex-row items-start justify-between'>
            <Text
              className='text-2xl font-bold flex-1 mr-2'
              style={{ color: colors.text }}
            >
              {group.name}
            </Text>
            <View
              className='px-2 py-1 rounded-full'
              style={{ backgroundColor: colors.primary + "20" }}
            >
              <Text
                className='text-xs font-semibold capitalize'
                style={{ color: colors.primary }}
              >
                {group.visibility}
              </Text>
            </View>
          </View>
          <Text className='mt-3 leading-6' style={{ color: colors.textMuted }}>
            {group.description || "No description available."}
          </Text>

          <View className='mt-4 flex-row items-center justify-between'>
            <Text style={{ color: colors.textMuted }}>
              Created by {group.creator_name}
            </Text>
            <View className='flex-row items-center'>
              <Users color={colors.textMuted} size={16} />
              <Text className='ml-1' style={{ color: colors.textMuted }}>
                {group.member_count}
              </Text>
            </View>
          </View>

          {!group.is_member ? (
            <TouchableOpacity
              onPress={() => joinMutation.mutate()}
              disabled={ctaPending}
              className='mt-5 p-3 rounded-xl items-center'
              style={{ backgroundColor: colors.primary }}
            >
              {ctaPending ? (
                <ActivityIndicator size='small' color='white' />
              ) : (
                <Text className='font-bold text-white'>Join Group</Text>
              )}
            </TouchableOpacity>
          ) : canLeave ? (
            <TouchableOpacity
              onPress={() => leaveMutation.mutate()}
              disabled={ctaPending}
              className='mt-5 p-3 rounded-xl items-center'
              style={{ borderWidth: 1, borderColor: colors.danger }}
            >
              {ctaPending ? (
                <ActivityIndicator size='small' color={colors.danger} />
              ) : (
                <Text className='font-bold' style={{ color: colors.danger }}>
                  Leave Group
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View
              className='mt-5 p-3 rounded-xl flex-row items-center justify-center'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Shield color={colors.primary} size={16} />
              <Text
                className='font-semibold ml-2'
                style={{ color: colors.text }}
              >
                You are an admin of this group
              </Text>
            </View>
          )}
        </View>

        <View className='p-5'>
          <Text
            className='text-xl font-bold mb-3'
            style={{ color: colors.text }}
          >
            Members ({group.members?.length || 0})
          </Text>
          {(group.members || []).map((member) => (
            <View
              key={member.rider_id}
              className='p-3 rounded-xl mb-2 flex-row justify-between items-center'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text className='font-semibold' style={{ color: colors.text }}>
                {member.display_name}
              </Text>
              <View
                className='px-2 py-1 rounded-full'
                style={{
                  backgroundColor:
                    member.role === "admin"
                      ? colors.primary + "20"
                      : colors.border,
                }}
              >
                <Text
                  className='text-xs font-semibold capitalize'
                  style={{
                    color:
                      member.role === "admin"
                        ? colors.primary
                        : colors.textMuted,
                  }}
                >
                  {member.role}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
