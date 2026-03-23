import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../src/api/client';
import { RideCard } from '../../src/components/RideCard';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { useTheme } from '../../src/theme/ThemeContext';

const fetchRides = async () => {
  const { data } = await apiClient.get('/api/rides');
  return data.rides;
};

export default function DiscoverRidesScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: rides, isLoading, isError, refetch } = useQuery({
    queryKey: ['rides'],
    queryFn: fetchRides,
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
          <Text className="mb-2" style={{ color: colors.danger }}>Error loading rides</Text>
          <Text style={{ color: colors.primary }} onPress={() => refetch()}>Try Again</Text>
        </View>
      );
    }

    return (
      <View className="flex-1">
        <FlatList
          data={rides || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RideCard ride={item} onPress={() => router.push(`/ride/${item.id}` as any)} />
          )}
          contentContainerStyle={(!rides || rides.length === 0) ? { flexGrow: 1 } : { paddingVertical: 16 }}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center">
              <Text style={{ color: colors.textMuted }}>No active rides found</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              title="Finding Rides..."
              titleColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surface}
            />
          }
        />
        <TouchableOpacity
          onPress={() => router.push('/(modals)/create-ride')}
          className="absolute bottom-6 right-5 w-14 h-14 rounded-full items-center justify-center shadow-lg z-50 elevation-5"
          style={{ backgroundColor: colors.primary }}
          activeOpacity={0.8}
        >
          <Plus color="white" size={30} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View
        className="px-4 py-3"
        style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Text className="text-2xl font-bold tracking-tight" style={{ color: colors.text }}>Discover Rides</Text>
      </View>
      {renderContent()}
    </SafeAreaView>
  );
}
