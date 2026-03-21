import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../../src/components/MapWrapper';
import { Calendar, Users, Gauge, ChevronLeft, Navigation, Shield, CheckCircle, XCircle, Clock, Edit3 } from 'lucide-react-native';
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

const promoteRider = async (rideId: string, riderId: string) => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/promote`, { rider_id: riderId });
  return data;
};

const handleStop = async (rideId: string, stopId: string, status: string) => {
  const { data } = await apiClient.patch(`/api/rides/${rideId}/stops/${stopId}`, { status });
  return data;
};

const updateRideStatus = async (rideId: string, status: string) => {
  const { data } = await apiClient.patch(`/api/rides/${rideId}`, { status });
  return data;
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#64748b',
  scheduled: '#3b82f6',
  active: '#22c55e',
  completed: '#a855f7',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const NEXT_STATUS: Record<string, { label: string; status: string } | null> = {
  draft: { label: 'Publish', status: 'scheduled' },
  scheduled: { label: 'Start Ride', status: 'active' },
  active: { label: 'Complete Ride', status: 'completed' },
  completed: null,
  cancelled: null,
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
      Alert.alert('Error', err.response?.data?.error || err.response?.data?.message || 'Failed to join ride');
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (riderId: string) => promoteRider(id!, riderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', id] });
      Alert.alert('Success', 'Rider promoted to co-captain!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to promote');
    },
  });

  const stopMutation = useMutation({
    mutationFn: ({ stopId, status }: { stopId: string; status: string }) => handleStop(id!, stopId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', id] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update stop');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateRideStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', id] });
      queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update status');
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
  const isCaptain = ride.captain_id === currentRider?.id;
  const isCoCaptain = ride.participants?.some((p: any) => p.rider_id === currentRider?.id && p.role === 'co_captain');
  const isLeader = isCaptain || isCoCaptain;
  const isFull = ride.max_capacity && ride.current_rider_count >= ride.max_capacity;
  const dateStr = new Date(ride.scheduled_at).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const nextAction = NEXT_STATUS[ride.status];

  const handleGetDirections = () => {
    if (!startCoords) return;
    showLocation({
      latitude: startCoords[1], longitude: startCoords[0],
      title: 'Ride Start Point', dialogTitle: 'Navigate to Start Point',
      dialogMessage: 'Choose your preferred maps app', cancelText: 'Cancel',
    });
  };

  const handlePromote = (riderId: string, name: string) => {
    Alert.alert('Promote to Co-Captain', `Promote ${name} to co-captain?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Promote', onPress: () => promoteMutation.mutate(riderId) },
    ]);
  };

  const handleStatusChange = () => {
    if (!nextAction) return;
    Alert.alert(`${nextAction.label}?`, `Change ride status to ${nextAction.status}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: nextAction.label, onPress: () => statusMutation.mutate(nextAction.status) },
    ]);
  };

  const stopIcon = (type: string) => {
    if (type === 'fuel') return '⛽';
    if (type === 'rest') return '☕';
    if (type === 'photo') return '📸';
    return '📍';
  };

  // Collect approved stop markers
  const stopMarkers = (ride.stops || []).filter((s: any) => s.status !== 'rejected');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Map Header */}
      <View className="h-72 w-full relative">
        {startCoords && (
          <MapView
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            userInterfaceStyle="dark"
            initialRegion={{
              latitude: startCoords[1], longitude: startCoords[0],
              latitudeDelta: 0.2, longitudeDelta: 0.2,
            }}
          >
            <Marker coordinate={{ latitude: startCoords[1], longitude: startCoords[0] }} title="Start" pinColor="#22c55e" />
            {endCoords && (
              <>
                <Marker coordinate={{ latitude: endCoords[1], longitude: endCoords[0] }} title="End" pinColor="#f43f5e" />
                <Polyline
                  coordinates={[
                    { latitude: startCoords[1], longitude: startCoords[0] },
                    ...stopMarkers
                      .filter((s: any) => s.location?.coordinates)
                      .map((s: any) => ({ latitude: s.location.coordinates[1], longitude: s.location.coordinates[0] })),
                    { latitude: endCoords[1], longitude: endCoords[0] },
                  ]}
                  strokeColor="#22c55e" strokeWidth={4} lineDashPattern={[10, 10]}
                />
              </>
            )}
            {stopMarkers
              .filter((s: any) => s.location?.coordinates)
              .map((s: any, i: number) => (
                <Marker
                  key={`stop-${i}`}
                  coordinate={{ latitude: s.location.coordinates[1], longitude: s.location.coordinates[0] }}
                  pinColor="#f59e0b"
                  title={`${s.type} stop`}
                />
              ))}
          </MapView>
        )}
        <SafeAreaView className="absolute top-0 left-0 right-0 px-4 pt-2 flex-row justify-between items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          >
            <ChevronLeft color="white" size={24} />
          </TouchableOpacity>
          {/* Status Badge */}
          <View className="px-3 py-1 rounded-full" style={{ backgroundColor: STATUS_COLORS[ride.status] || colors.border }}>
            <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>{STATUS_LABELS[ride.status] || ride.status}</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Title & Captain */}
        <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View className="flex-row justify-between items-start">
            <Text className="text-3xl font-bold flex-1 mr-2" style={{ color: colors.text }}>{ride.title}</Text>
            {isLeader && (
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: '/(modals)/create-ride',
                  params: { editRide: JSON.stringify(ride) }
                })}
                className="p-2 rounded-full"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Edit3 color={colors.text} size={20} />
              </TouchableOpacity>
            )}
          </View>
          <Text className="text-sm mb-4 mt-2" style={{ color: colors.textMuted }}>
            Hosted by <Text className="font-bold" style={{ color: colors.text }}>{ride.captain_name}</Text>
          </Text>
          <View className="flex-row items-center mb-3">
            <Calendar color={colors.primary} size={20} />
            <Text className="text-base ml-3" style={{ color: colors.text }}>{dateStr}</Text>
          </View>
          <View className="flex-row flex-wrap mt-2">
            <View className="w-1/2 flex-row items-center mb-4">
              <Users color={colors.textMuted} size={18} />
              <Text className="ml-2" style={{ color: colors.textMuted }}>
                {ride.current_rider_count}{ride.max_capacity ? ` / ${ride.max_capacity}` : ''} Joined
              </Text>
            </View>
            <View className="w-1/2 flex-row items-center mb-4">
              <Gauge color={colors.textMuted} size={18} />
              <Text className="ml-2" style={{ color: colors.textMuted }}>{Math.round((ride.estimated_duration_min || 0) / 60)}h Duration</Text>
            </View>
          </View>
          {startCoords && (
            <TouchableOpacity
              onPress={handleGetDirections}
              className="flex-row items-center p-3 rounded-xl mt-2"
              style={{ backgroundColor: colors.primary + '1A', borderWidth: 1, borderColor: colors.primary + '4D' }}
            >
              <Navigation color={colors.primary} size={20} />
              <Text className="font-bold ml-2" style={{ color: colors.primary }}>Get Directions to Start Point</Text>
            </TouchableOpacity>
          )}

          {/* Captain: Status Advance Button */}
          {isLeader && nextAction && (
            <TouchableOpacity
              onPress={handleStatusChange}
              disabled={statusMutation.isPending}
              className="p-3 rounded-xl mt-3 items-center"
              style={{ backgroundColor: colors.primary }}
            >
              {statusMutation.isPending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="font-bold" style={{ color: '#ffffff' }}>{nextAction.label}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* About */}
        <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text className="text-xl font-bold mb-3" style={{ color: colors.text }}>About this Ride</Text>
          <Text className="leading-6" style={{ color: colors.textMuted }}>{ride.description || 'No description provided.'}</Text>
        </View>

        {/* Requirements */}
        <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text className="text-xl font-bold mb-3" style={{ color: colors.text }}>Requirements</Text>
          {ride.requirements ? (
            <View className="p-4 rounded-xl" style={{ borderWidth: 1, borderColor: colors.border }}>
              {ride.requirements.min_experience && (
                <>
                  <Text className="mb-1 font-bold" style={{ color: colors.text }}>Experience:</Text>
                  <Text className="font-bold capitalize mb-3" style={{ color: colors.primary }}>{ride.requirements.min_experience}</Text>
                </>
              )}
              {ride.requirements.mandatory_gear?.length > 0 && (
                <>
                  <Text className="mb-2 font-bold" style={{ color: colors.text }}>Mandatory Gear:</Text>
                  <View className="flex-row flex-wrap mb-3">
                    {ride.requirements.mandatory_gear.map((g: string, i: number) => (
                      <View key={i} className="px-3 py-1 rounded-full mr-2 mb-2" style={{ backgroundColor: colors.surface }}>
                        <Text className="text-sm capitalize" style={{ color: colors.text }}>{g}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
              {ride.requirements.vehicle_type && (
                <>
                  <Text className="mb-1 font-bold" style={{ color: colors.text }}>Vehicle Type:</Text>
                  <Text className="font-bold capitalize" style={{ color: colors.primary }}>{ride.requirements.vehicle_type}</Text>
                </>
              )}
            </View>
          ) : (
            <Text style={{ color: colors.textMuted }}>None specified.</Text>
          )}
        </View>

        {/* Stops */}
        {ride.stops && ride.stops.length > 0 && (
          <View className="p-5" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text className="text-xl font-bold mb-3" style={{ color: colors.text }}>Stops</Text>
            {ride.stops.map((stop: any, i: number) => (
              <View key={i} className="flex-row items-center justify-between p-3 rounded-xl mb-2"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <View className="flex-row items-center flex-1">
                  <Text className="text-lg mr-2">{stopIcon(stop.type)}</Text>
                  <View>
                    <Text className="font-bold capitalize" style={{ color: colors.text }}>{stop.type} Stop</Text>
                    <Text className="text-xs" style={{ color: colors.textMuted }}>
                      by {stop.requester_name || 'Unknown'}
                    </Text>
                  </View>
                </View>
                {/* Status Badge */}
                <View className="flex-row items-center">
                  {stop.status === 'approved' && <CheckCircle color="#22c55e" size={16} />}
                  {stop.status === 'rejected' && <XCircle color="#ef4444" size={16} />}
                  {stop.status === 'pending' && <Clock color="#f59e0b" size={16} />}
                  <Text className="ml-1 text-xs font-bold capitalize"
                    style={{ color: stop.status === 'approved' ? '#22c55e' : stop.status === 'rejected' ? '#ef4444' : '#f59e0b' }}
                  >
                    {stop.status}
                  </Text>
                </View>
                {/* Captain: Approve/Reject pending stops */}
                {isLeader && stop.status === 'pending' && (
                  <View className="flex-row ml-2">
                    <TouchableOpacity
                      onPress={() => stopMutation.mutate({ stopId: stop.id, status: 'approved' })}
                      className="w-8 h-8 rounded-full items-center justify-center mr-1"
                      style={{ backgroundColor: '#22c55e20' }}
                    >
                      <CheckCircle color="#22c55e" size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => stopMutation.mutate({ stopId: stop.id, status: 'rejected' })}
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#ef444420' }}
                    >
                      <XCircle color="#ef4444" size={18} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Participants */}
        <View className="p-5 mb-10">
          <Text className="text-xl font-bold mb-4" style={{ color: colors.text }}>
            Participants ({ride.participants?.length || 0})
          </Text>
          {ride.participants?.map((p: any, i: number) => (
            <View key={i} className="flex-row items-center mb-3 p-3 rounded-2xl"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: colors.border }}
              >
                <Text className="font-bold text-lg" style={{ color: colors.text }}>{p.display_name?.charAt(0)}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="font-bold text-base" style={{ color: colors.text }}>{p.display_name}</Text>
                  {/* Role Badge */}
                  {p.role === 'captain' && (
                    <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.primary }}>
                      <Text className="text-[10px] font-bold" style={{ color: '#ffffff' }}>Captain</Text>
                    </View>
                  )}
                  {p.role === 'co_captain' && (
                    <View className="ml-2 px-2 py-0.5 rounded-full flex-row items-center" style={{ backgroundColor: '#3b82f6' }}>
                      <Shield color="#ffffff" size={10} />
                      <Text className="text-[10px] font-bold ml-0.5" style={{ color: '#ffffff' }}>Co-Captain</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs capitalize" style={{ color: colors.textMuted }}>{p.role.replace('_', '-')}</Text>
              </View>
              {/* Captain: Promote button for regular riders */}
              {isCaptain && p.role === 'rider' && (
                <TouchableOpacity
                  onPress={() => handlePromote(p.rider_id, p.display_name)}
                  className="px-3 py-1.5 rounded-full"
                  style={{ borderWidth: 1, borderColor: '#3b82f6' }}
                >
                  <Text className="text-xs font-bold" style={{ color: '#3b82f6' }}>Promote</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
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
