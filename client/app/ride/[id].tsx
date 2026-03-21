import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import MapView, { Marker, Polyline } from '../../src/components/MapWrapper';
import { Calendar, Users, MapPin, Gauge, ChevronLeft, Navigation } from 'lucide-react-native';
import { showLocation } from 'react-native-map-link';
import { useTheme } from '../../src/theme/ThemeContext';

const fetchRideDetails = async (id: string) => {
  const { data } = await apiClient.get(`/api/rides/${id}`);
  return data.ride;
};

const joinRide = async (id: string) => {
  const { data } = await apiClient.post(`/api/rides/${id}/join`);
  return data;
};

export default function RideDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRider = useAuthStore((state: any) => state.rider);

  const { data: ride, isLoading, isError } = useQuery({
    queryKey: ['ride', id],
    queryFn: () => fetchRideDetails(id!),
    enabled: !!id,
  });

  const joinMutation = useMutation({
    mutationFn: () => joinRide(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', id] });
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      Alert.alert('Success', 'You have joined the ride!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to join ride');
    },
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center" style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError || !ride) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center" style={{ backgroundColor: colors.bg }}>
        <Text className="font-bold" style={{ color: colors.danger }}>Failed to load ride details.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 p-3 rounded-xl">
          <Text className="font-bold" style={{ color: colors.text }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const startCoords = ride.start_point_geojson?.coordinates;
  const endCoords = ride.end_point_geojson?.coordinates;
  const isParticipant = ride.participants?.some((p: any) => p.rider_id === currentRider?.id);
  const isFull = ride.max_capacity && ride.current_rider_count >= ride.max_capacity;
  const dateStr = new Date(ride.scheduled_at).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const handleGetDirections = () => {
    if (!startCoords) return;
    showLocation({
      latitude: startCoords[1],
      longitude: startCoords[0],
      title: 'Ride Start Point',
      dialogTitle: 'Navigate to Start Point',
      dialogMessage: 'Choose your preferred maps app for directions',
      cancelText: 'Cancel',
    });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Map Header */}
      <View className="h-72 w-full relative">
        {startCoords && (
          <MapView
            style={{ flex: 1 }}
            userInterfaceStyle="dark"
            initialRegion={{
              latitude: startCoords[1],
              longitude: startCoords[0],
              latitudeDelta: 0.2,
              longitudeDelta: 0.2,
            }}
          >
            <Marker coordinate={{ latitude: startCoords[1], longitude: startCoords[0] }} title="Start" pinColor="#22c55e" />
            {endCoords && (
              <>
                <Marker coordinate={{ latitude: endCoords[1], longitude: endCoords[0] }} title="End" pinColor="#f43f5e" />
                <Polyline
                  coordinates={[
                    { latitude: startCoords[1], longitude: startCoords[0] },
                    { latitude: endCoords[1], longitude: endCoords[0] },
                  ]}
                  strokeColor="#22c55e"
                  strokeWidth={4}
                  lineDashPattern={[10, 10]}
                />
              </>
            )}
          </MapView>
        )}
        <SafeAreaView className="absolute top-0 left-0 right-0 px-4 pt-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          >
            <ChevronLeft color="white" size={24} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text className="text-3xl font-bold flex-1" style={{ color: colors.text }}>{ride.title}</Text>
          <Text className="text-sm mb-4 mt-1" style={{ color: colors.textMuted }}>
            Hosted by <Text className="font-bold" style={{ color: colors.text }}>{ride.captain_name}</Text>
          </Text>
          <View className="flex-row items-center mb-3">
            <Calendar color={colors.primary} size={20} className="mr-3" />
            <Text className="text-base" style={{ color: colors.text }}>{dateStr}</Text>
          </View>
          <View className="flex-row flex-wrap mt-2">
            <View className="w-1/2 flex-row items-center mb-4">
              <Users color={colors.textMuted} size={18} className="mr-2" />
              <Text style={{ color: colors.textMuted }}>
                {ride.current_rider_count} {ride.max_capacity ? `/ ${ride.max_capacity}` : ''} Joined
              </Text>
            </View>
            <View className="w-1/2 flex-row items-center mb-4">
              <Gauge color={colors.textMuted} size={18} className="mr-2" />
              <Text style={{ color: colors.textMuted }}>{Math.round((ride.estimated_duration_min || 0) / 60)}h Duration</Text>
            </View>
          </View>
          {startCoords && (
            <TouchableOpacity
              onPress={handleGetDirections}
              className="flex-row items-center p-3 rounded-xl mt-2"
              style={{ backgroundColor: colors.primary + '1A', borderWidth: 1, borderColor: colors.primary + '4D' }}
            >
              <Navigation color={colors.primary} size={20} className="mr-2" />
              <Text className="font-bold" style={{ color: colors.primary }}>Get Directions to Start Point</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text className="text-xl font-bold mb-3" style={{ color: colors.text }}>About this Ride</Text>
          <Text className="leading-6" style={{ color: colors.textMuted }}>{ride.description || 'No description provided.'}</Text>
        </View>

        <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text className="text-xl font-bold mb-3" style={{ color: colors.text }}>Requirements</Text>
          {ride.requirements ? (
            <View className="p-4 rounded-xl" style={{ borderWidth: 1, borderColor: colors.border }}>
              <Text className="mb-2 font-bold" style={{ color: colors.text }}>Experience:</Text>
              <Text className="font-bold capitalize mb-4" style={{ color: colors.primary }}>{ride.requirements.min_experience}</Text>
              <Text className="mb-2 font-bold" style={{ color: colors.text }}>Mandatory Gear:</Text>
              <View className="flex-row flex-wrap">
                {ride.requirements.mandatory_gear?.map((g: string, i: number) => (
                  <View key={i} className="px-3 py-1 rounded-full mr-2 mb-2" style={{ backgroundColor: colors.surface }}>
                    <Text className="text-sm capitalize" style={{ color: colors.text }}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.textMuted }}>None specified.</Text>
          )}
        </View>

        <View className="p-5 mb-10">
          <Text className="text-xl font-bold mb-4" style={{ color: colors.text }}>
            Participants ({ride.participants?.length || 0})
          </Text>
          {ride.participants?.map((p: any, i: number) => (
            <View key={i} className="flex-row items-center mb-4 p-3 rounded-2xl"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: colors.border }}
              >
                <Text className="font-bold text-lg" style={{ color: colors.text }}>{p.display_name.charAt(0)}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-bold text-base" style={{ color: colors.text }}>{p.display_name}</Text>
                <Text className="text-xs capitalize" style={{ color: colors.textMuted }}>{p.role}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Floating Action Button for Joining */}
      <View className="absolute bottom-6 left-5 right-5 pb-5 pt-4">
        {isParticipant ? (
          <View className="p-4 rounded-2xl w-full shadow-lg"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text className="font-bold text-center text-lg" style={{ color: colors.text }}>
              You are participating in this ride! 🎉
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => joinMutation.mutate()}
            disabled={joinMutation.isPending || isFull}
            className="p-4 rounded-2xl shadow-lg"
            style={{ backgroundColor: isFull ? colors.border : colors.primary }}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-center text-lg" style={{ color: '#ffffff' }}>
                {isFull ? 'Ride is Full' : 'Join Ride'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
