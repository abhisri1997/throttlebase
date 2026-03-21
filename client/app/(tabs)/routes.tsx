import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../src/api/client';
import { RouteCard } from '../../src/components/RouteCard';
import { Plus } from 'lucide-react-native';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';

const fetchRoutes = async () => {
  const { data } = await apiClient.get('/api/routes');
  return data;
};

export default function ExploreRoutesScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: routes, isLoading, isError, refetch } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
  });

  const { refreshing, onRefresh } = usePullToRefresh(async () => { await refetch() });

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (isError) {
      return (
        <View className="flex-1 justify-center items-center">
          <Text className="mb-2" style={{ color: colors.danger }}>Error loading routes</Text>
          <Text style={{ color: colors.primary }} onPress={() => refetch()}>Try Again</Text>
        </View>
      );
    }

    if (!routes || routes.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <Text className="mb-4" style={{ color: colors.textMuted }}>No routes found.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RouteCard routeData={item} onPress={() => router.push(`/route/${item.id}` as any)} />
        )}
        contentContainerStyle={{ paddingVertical: 16, paddingBottom: 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            title="Scouting Routes..."
            titleColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View
        className="flex-row justify-between items-center px-4 py-3"
        style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Text className="text-2xl font-bold tracking-tight" style={{ color: colors.text }}>Explore Routes</Text>
      </View>
      {renderContent()}
      <TouchableOpacity
        onPress={() => {
          if (Platform.OS === 'web') {
            alert('Live Route tracking requires a physical mobile device with GPS sensors!');
          } else {
            Alert.alert('Not Enabled', 'Live GPS route tracking is in development.');
          }
        }}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg"
        style={{ backgroundColor: colors.primary }}
        activeOpacity={0.8}
      >
        <Plus color="white" size={28} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
