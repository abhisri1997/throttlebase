import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { RideCard } from "../../src/components/RideCard";
import { Plus } from "lucide-react-native";
import { useRouter } from "expo-router";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { useTheme } from "../../src/theme/ThemeContext";
import { NotificationBell } from "../../src/components/NotificationBell";

type RideStatusFilter = "all" | "draft" | "scheduled" | "active";

const filterLabel: Record<RideStatusFilter, string> = {
  all: "All",
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Started",
};

const fetchRides = async (status: RideStatusFilter) => {
  const { data } = await apiClient.get("/api/rides", {
    params: { status },
  });
  return data.rides;
};

export default function DiscoverRidesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<RideStatusFilter>("all");

  const {
    data: rides,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["rides", statusFilter],
    queryFn: () => fetchRides(statusFilter),
  });

  const statusLabel = useMemo(() => filterLabel[statusFilter], [statusFilter]);

  const openFilterPicker = () => {
    Alert.alert("Filter rides", "Choose status", [
      { text: "All", onPress: () => setStatusFilter("all") },
      { text: "Draft", onPress: () => setStatusFilter("draft") },
      { text: "Scheduled", onPress: () => setStatusFilter("scheduled") },
      { text: "Started", onPress: () => setStatusFilter("active") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

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
          <Text className='mb-2' style={{ color: colors.danger }}>
            Error loading rides
          </Text>
          <Text style={{ color: colors.primary }} onPress={() => refetch()}>
            Try Again
          </Text>
        </View>
      );
    }

    return (
      <View className='flex-1'>
        <FlatList
          data={rides || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RideCard
              ride={item}
              onPress={() => router.push(`/ride/${item.id}` as any)}
            />
          )}
          contentContainerStyle={
            !rides || rides.length === 0
              ? { flexGrow: 1 }
              : { paddingVertical: 16 }
          }
          ListEmptyComponent={
            <View className='flex-1 justify-center items-center'>
              <Text style={{ color: colors.textMuted }}>
                No active rides found
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              title='Finding Rides...'
              titleColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surface}
            />
          }
        />
        <TouchableOpacity
          onPress={() => router.push("/(modals)/create-ride")}
          className='absolute bottom-6 right-5 w-14 h-14 rounded-full items-center justify-center shadow-lg z-50 elevation-5'
          style={{ backgroundColor: colors.primary }}
          activeOpacity={0.8}
        >
          <Plus color='white' size={30} />
        </TouchableOpacity>
      </View>
    );
  };

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
          className='text-2xl font-bold tracking-tight flex-1'
          style={{ color: colors.text }}
        >
          Discover Rides
        </Text>
        <TouchableOpacity
          onPress={openFilterPicker}
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
            {statusLabel}
          </Text>
        </TouchableOpacity>
        <NotificationBell />
      </View>
      {renderContent()}
    </SafeAreaView>
  );
}
