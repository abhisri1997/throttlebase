import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Plus, Users } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { useTheme } from "../../src/theme/ThemeContext";
import { NotificationBell } from "../../src/components/NotificationBell";

type GroupItem = {
  id: string;
  name: string;
  description?: string | null;
  visibility: "public" | "private";
  creator_name: string;
  member_count: number;
  is_member: boolean;
  current_user_role?: "admin" | "member" | null;
};

type GroupScope = "all" | "public" | "joined";

const scopeLabel: Record<GroupScope, string> = {
  all: "Public + Joined",
  public: "Public",
  joined: "Joined",
};

const fetchGroups = async (scope: GroupScope): Promise<GroupItem[]> => {
  const { data } = await apiClient.get("/api/community/groups", {
    params: { scope },
  });
  return data;
};

export default function GroupsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<GroupScope>("all");

  const {
    data: groups,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["groups", scope],
    queryFn: () => fetchGroups(scope),
  });

  const joinMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { data } = await apiClient.post(
        `/api/community/groups/${groupId}/join`,
      );
      return data;
    },
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to join group"));
    },
  });

  const openScopePicker = () => {
    Alert.alert("Filter groups", "Choose what to show", [
      {
        text: "Public + Joined",
        onPress: () => setScope("all"),
      },
      {
        text: "Public only",
        onPress: () => setScope("public"),
      },
      {
        text: "My joined groups",
        onPress: () => setScope("joined"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const scopeText = useMemo(() => scopeLabel[scope], [scope]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refetch();
  });

  if (isLoading) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
        edges={["top"]}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center p-6'
        style={{ backgroundColor: colors.bg }}
        edges={["top"]}
      >
        <Text className='font-bold mb-2' style={{ color: colors.danger }}>
          Error loading groups
        </Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={{ color: colors.primary }}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

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
        <Text
          className='text-2xl font-bold flex-1'
          style={{ color: colors.text }}
        >
          Groups
        </Text>
        <TouchableOpacity
          onPress={openScopePicker}
          className='px-3 py-2 rounded-full mr-2'
          style={{
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            className='text-xs font-semibold'
            style={{ color: colors.textMuted }}
          >
            {scopeText}
          </Text>
        </TouchableOpacity>
        <NotificationBell />
      </View>

      <FlatList
        data={groups || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingVertical: 14,
          paddingHorizontal: 14,
          paddingBottom: 120,
          flexGrow: groups?.length ? 0 : 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            title='Refreshing groups...'
            titleColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        ListEmptyComponent={
          <View className='flex-1 justify-center items-center px-8'>
            <Users color={colors.textMuted} size={34} />
            <Text
              className='mt-3 text-center'
              style={{ color: colors.textMuted }}
            >
              No groups yet. Create one and start riding together.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/group/${item.id}` as any)}
            className='rounded-2xl p-4 mb-3'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View className='flex-row items-start justify-between mb-2'>
              <Text
                className='text-lg font-bold flex-1 mr-3'
                style={{ color: colors.text }}
              >
                {item.name}
              </Text>
              <View
                className='px-2 py-1 rounded-full'
                style={{ backgroundColor: colors.primary + "20" }}
              >
                <Text
                  className='text-xs font-semibold capitalize'
                  style={{ color: colors.primary }}
                >
                  {item.visibility}
                </Text>
              </View>
            </View>

            <Text
              className='mb-3'
              style={{ color: colors.textMuted }}
              numberOfLines={2}
            >
              {item.description || "No description provided."}
            </Text>

            <View className='flex-row items-center justify-between'>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                Created by {item.creator_name}
              </Text>
              <View className='flex-row items-center'>
                <Text
                  className='text-xs mr-3'
                  style={{ color: colors.textMuted }}
                >
                  {item.member_count} members
                </Text>
                {item.is_member ? (
                  <View
                    className='px-3 py-1.5 rounded-full'
                    style={{
                      backgroundColor:
                        item.current_user_role === "admin"
                          ? colors.primary + "20"
                          : colors.border,
                    }}
                  >
                    <Text
                      className='text-xs font-bold'
                      style={{
                        color:
                          item.current_user_role === "admin"
                            ? colors.primary
                            : colors.textMuted,
                      }}
                    >
                      {item.current_user_role === "admin" ? "Admin" : "Member"}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => joinMutation.mutate(item.id)}
                    disabled={joinMutation.isPending}
                    className='px-3 py-1.5 rounded-full'
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Text className='text-xs font-bold text-white'>Join</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        onPress={() => router.push("/(modals)/create-group")}
        className='absolute bottom-6 right-5 w-14 h-14 rounded-full items-center justify-center shadow-lg z-50 elevation-5'
        style={{ backgroundColor: colors.primary }}
        activeOpacity={0.85}
      >
        <Plus color='white' size={30} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
