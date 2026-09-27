import React from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { RouteCard, type RouteListItem } from "../../src/features/routes/components/RouteCard";
import { useCurrentRider } from "../../src/services/useCurrentRider";
import { Plus } from "lucide-react-native";
import { usePullToRefresh } from "../../src/hooks/usePullToRefresh";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/theme/ThemeContext";
import { NotificationBell } from "../../src/components/NotificationBell";

const fetchRoutes = async (): Promise<RouteListItem[]> => {
  const { data } = await apiClient.get("/api/routes");
  if (!Array.isArray(data)) return [];
  // A server from before route places (or a partial row) omits these lists.
  return data.map((route: RouteListItem) => ({
    ...route,
    via: Array.isArray(route.via) ? route.via : [],
    highlights: Array.isArray(route.highlights) ? route.highlights : [],
  }));
};

export default function ExploreRoutesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { riderId } = useCurrentRider();

  const {
    data: routes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["routes"],
    queryFn: fetchRoutes,
  });

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
            Error loading routes
          </Text>
          <Text style={{ color: colors.primary }} onPress={() => refetch()}>
            Try Again
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={routes ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RouteCard
            route={item}
            viewerId={riderId}
            onPress={() => router.push(`/route/${item.id}` as any)}
          />
        )}
        ListEmptyComponent={
          <View className='flex-1 justify-center items-center px-6'>
            <Text className='mb-4 text-center' style={{ color: colors.textMuted }}>
              No routes yet. Finish a ride, then save it as a route from the ride's page to share it here.
            </Text>
          </View>
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingVertical: 16,
          paddingBottom: 80,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            title='Scouting Routes...'
            titleColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView
      className='flex-1'
      style={{ backgroundColor: colors.bg }}
      edges={["top"]}
    >
      <View
        className='flex-row justify-between items-center px-4 py-3'
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          className='text-2xl font-bold tracking-tight'
          style={{ color: colors.text }}
        >
          Explore Routes
        </Text>
        <NotificationBell />
      </View>
      {renderContent()}
      <TouchableOpacity
        // Routes are saved from finished rides, which live in ride history.
        onPress={() => router.push("/ride-history")}
        accessibilityRole='button'
        accessibilityLabel='Save a route from one of your rides'
        className='absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg'
        style={{ backgroundColor: colors.primary }}
        activeOpacity={0.8}
      >
        <Plus color='white' size={28} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
