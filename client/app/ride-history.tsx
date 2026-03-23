import React from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../src/api/client';
import { RideCard } from '../src/components/RideCard';
import { useRouter } from 'expo-router';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { useTheme } from '../src/theme/ThemeContext';
import { ArrowLeft } from 'lucide-react-native';

const fetchRideHistory = async () => {
  const { data } = await apiClient.get('/api/rides/history');
  return data.rides;
};

export default function RideHistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: rides, isLoading, isError, refetch } = useQuery({
    queryKey: ['rides', 'history'],
    queryFn: fetchRideHistory,
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
          <Text className="mb-2" style={{ color: colors.danger }}>Error loading ride history</Text>
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
          contentContainerStyle={(!rides || rides.length === 0) ? { flexGrow: 1 } : { padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center">
              <Text style={{ color: colors.textMuted }}>No completed or cancelled rides found</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      </View>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className="px-4 pt-2 pb-4 flex-row items-center"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}
        edges={['top']}
      >
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className="text-xl font-bold flex-1" style={{ color: colors.text }}>Ride History</Text>
      </SafeAreaView>

      {renderContent()}
    </View>
  );
}
