import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Calendar, MapPin, Check } from 'lucide-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../src/api/client';
import MapView, { Marker, Polyline } from '../../src/components/MapWrapper';
import { useTheme } from '../../src/theme/ThemeContext';

const createRide = async (payload: any) => {
  const { data } = await apiClient.post('/api/rides', payload);
  return data;
};

export default function CreateRideModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [duration, setDuration] = useState('180');
  const [isPrivate, setIsPrivate] = useState(false);

  // Hardcode a default scheduled time for tomorrow in the prototype
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(6, 0, 0, 0);

  // Map state
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [endCoords, setEndCoords] = useState<[number, number] | null>(null);
  const [selectingPoint, setSelectingPoint] = useState<'start' | 'end' | null>(null);

  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/rides');
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      createRide({
        title,
        description,
        visibility: isPrivate ? 'private' : 'public',
        scheduled_at: tomorrow.toISOString(),
        estimated_duration_min: parseInt(duration),
        max_capacity: parseInt(capacity),
        start_point_coords: startCoords,
        end_point_coords: endCoords,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      Alert.alert('Success', 'Ride has been hosted successfully!');
      closeModal();
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to host ride');
    },
  });

  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (selectingPoint === 'start') {
      setStartCoords([longitude, latitude]);
      setSelectingPoint(null);
    } else if (selectingPoint === 'end') {
      setEndCoords([longitude, latitude]);
      setSelectingPoint(null);
    }
  };

  const handleHost = () => {
    if (!title.trim()) return Alert.alert('Validation', 'A ride title is required');
    if (!startCoords || !endCoords)
      return Alert.alert('Validation', 'Please select both start and end points on the map');
    mutation.mutate();
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        className="px-4 pt-4 pb-2 flex-row justify-between items-center"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}
      >
        <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X color={colors.textMuted} size={24} />
        </TouchableOpacity>
        <Text className="font-bold text-lg" style={{ color: colors.text }}>Host a Ride</Text>
        <TouchableOpacity onPress={handleHost} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Check color={colors.primary} size={28} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-6">
        {/* Core Details */}
        <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
          Ride Details
        </Text>
        <TextInput
          className="text-lg p-4 rounded-xl mb-4"
          style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
          placeholder="Give your ride a catchy name..."
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          className="p-4 rounded-xl mb-6 h-24"
          style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
          placeholder="Describe the route, pacing, and stops..."
          placeholderTextColor={colors.textMuted}
          multiline
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />

        {/* Geographic Plotting */}
        <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
          Routing Plan
        </Text>
        <View className="p-4 rounded-2xl mb-6" style={{ borderWidth: 1, borderColor: colors.border }}>
          <View className="flex-row items-center mb-4">
            <TouchableOpacity
              onPress={() => setSelectingPoint('start')}
              className={`flex-1 py-2 px-3 rounded-lg mr-2 ${selectingPoint === 'start' ? 'border-primary-500 bg-primary-500/20' : ''}`}
              style={{ borderWidth: 1, borderColor: selectingPoint === 'start' ? colors.primary : colors.border }}
            >
              <Text className="text-center font-bold text-sm" style={{ color: colors.text }}>
                {startCoords ? 'Start Set ✓' : 'Set Start Point'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectingPoint('end')}
              className={`flex-1 py-2 px-3 rounded-lg ml-2 ${selectingPoint === 'end' ? 'border-rose-500 bg-rose-500/20' : ''}`}
              style={{ borderWidth: 1, borderColor: selectingPoint === 'end' ? '#f43f5e' : colors.border }}
            >
              <Text className="text-center font-bold text-sm" style={{ color: colors.text }}>
                {endCoords ? 'End Set ✓' : 'Set End Point'}
              </Text>
            </TouchableOpacity>
          </View>

          {selectingPoint && (
            <Text className="text-center text-xs font-bold mb-3" style={{ color: colors.primary }}>
              Tap anywhere on the map below to drop the {selectingPoint} pin!
            </Text>
          )}

          <View className="h-64 rounded-xl overflow-hidden relative" style={{ borderWidth: 1, borderColor: colors.border }}>
            <MapView
              style={{ flex: 1 }}
              userInterfaceStyle="dark"
              onPress={handleMapPress}
              initialRegion={{
                latitude: 12.9716,
                longitude: 77.5946,
                latitudeDelta: 0.5,
                longitudeDelta: 0.5,
              }}
            >
              {startCoords && (
                <Marker coordinate={{ latitude: startCoords[1], longitude: startCoords[0] }} pinColor="#22c55e" title="Start" />
              )}
              {endCoords && (
                <Marker coordinate={{ latitude: endCoords[1], longitude: endCoords[0] }} pinColor="#f43f5e" title="End" />
              )}
              {startCoords && endCoords && (
                <Polyline
                  coordinates={[
                    { latitude: startCoords[1], longitude: startCoords[0] },
                    { latitude: endCoords[1], longitude: endCoords[0] },
                  ]}
                  strokeColor="#22c55e"
                  strokeWidth={3}
                  lineDashPattern={[5, 5]}
                />
              )}
            </MapView>
          </View>
        </View>

        {/* Logistics */}
        <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
          Logistics
        </Text>
        <View className="flex-row mb-6">
          <View className="flex-1 mr-2">
            <Text className="text-xs mb-1 ml-1" style={{ color: colors.textMuted }}>Max Riders</Text>
            <TextInput
              keyboardType="number-pad"
              className="p-4 rounded-xl"
              style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
              value={capacity}
              onChangeText={setCapacity}
            />
          </View>
          <View className="flex-1 ml-2">
            <Text className="text-xs mb-1 ml-1" style={{ color: colors.textMuted }}>Duration (mins)</Text>
            <TextInput
              keyboardType="number-pad"
              className="p-4 rounded-xl"
              style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
              value={duration}
              onChangeText={setDuration}
            />
          </View>
        </View>

        {/* Settings */}
        <View
          className="flex-row items-center justify-between p-4 rounded-xl mb-12"
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <View>
            <Text className="font-bold text-lg mb-1" style={{ color: colors.text }}>Private Ride</Text>
            <Text className="text-xs w-64" style={{ color: colors.textMuted }}>
              If enabled, this ride will not appear on the Discover tab. Participants must have an invite link.
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="white"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
