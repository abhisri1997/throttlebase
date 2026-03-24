import React from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { getApiErrorMessage } from "../../src/utils/apiError";
import MapView, {
  Polyline,
  Marker,
  PROVIDER_GOOGLE,
} from "../../src/components/MapWrapper";
import {
  Map,
  Mountain,
  TrendingUp,
  ChevronLeft,
  Bookmark,
  Share2,
} from "lucide-react-native";
import { useTheme } from "../../src/theme/ThemeContext";

const fetchRouteDetails = async (id: string) => {
  const { data } = await apiClient.get(`/api/routes/${id}`);
  return data;
};

const bookmarkRoute = async (id: string) => {
  const { data } = await apiClient.post(`/api/routes/${id}/bookmark`);
  return data;
};

export default function RouteDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: route,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["route", id],
    queryFn: () => fetchRouteDetails(id!),
    enabled: !!id,
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => bookmarkRoute(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route", id] });
      Alert.alert("Success", "Route bookmarked successfully!");
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to bookmark route"));
    },
  });

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

  if (isError || !route) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <Text className='font-bold' style={{ color: colors.danger }}>
          Failed to load route details.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className='mt-4 p-3 rounded-xl'
        >
          <Text className='font-bold' style={{ color: colors.text }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const coords: [number, number][] = route.geojson?.coordinates || [];
  const mapCoords = coords.map((c) => ({ latitude: c[1], longitude: c[0] }));
  const startCoord = mapCoords[0];
  const endCoord = mapCoords[mapCoords.length - 1];
  const dateStr = new Date(route.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      {/* Map Header */}
      <View className='h-2/5 w-full relative'>
        {mapCoords.length > 0 ? (
          <MapView
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            userInterfaceStyle='dark'
            initialRegion={{
              latitude: startCoord.latitude,
              longitude: startCoord.longitude,
              latitudeDelta: 0.5,
              longitudeDelta: 0.5,
            }}
          >
            <Polyline
              coordinates={mapCoords}
              strokeColor='#22c55e'
              strokeWidth={5}
            />
            <Marker coordinate={startCoord} title='Start' pinColor='#22c55e' />
            <Marker coordinate={endCoord} title='End' pinColor='#f43f5e' />
          </MapView>
        ) : (
          <View
            className='flex-1 justify-center items-center'
            style={{ backgroundColor: colors.surface }}
          >
            <Text style={{ color: colors.textMuted }}>
              No Map Data Available
            </Text>
          </View>
        )}

        {/* Back Button */}
        <SafeAreaView className='absolute top-0 left-0 right-0 px-4 pt-2 flex-row justify-between'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='w-10 h-10 rounded-full items-center justify-center'
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          >
            <ChevronLeft color='white' size={24} />
          </TouchableOpacity>
          <View className='flex-row'>
            <TouchableOpacity
              onPress={() => bookmarkMutation.mutate()}
              className='w-10 h-10 rounded-full items-center justify-center mr-3'
              style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            >
              <Bookmark color='white' size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              className='w-10 h-10 rounded-full items-center justify-center'
              style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            >
              <Share2 color='white' size={20} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView className='flex-1'>
        <View
          className='p-5'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text
            className='text-3xl font-bold flex-1'
            style={{ color: colors.text }}
          >
            {route.title}
          </Text>
          <Text
            className='text-sm mb-4 mt-1'
            style={{ color: colors.textMuted }}
          >
            Created by{" "}
            <Text className='font-bold' style={{ color: colors.text }}>
              {route.creator_name}
            </Text>{" "}
            • {dateStr}
          </Text>
          <View className='flex-row flex-wrap mt-2'>
            <View className='w-1/2 flex-row items-center mb-4'>
              <Map color={colors.textMuted} size={18} className='mr-2' />
              <Text style={{ color: colors.textMuted }}>
                {route.distance_km || "Unknown"} km Distance
              </Text>
            </View>
            <View className='w-1/2 flex-row items-center mb-4'>
              <Mountain color={colors.textMuted} size={18} className='mr-2' />
              <Text className='capitalize' style={{ color: colors.textMuted }}>
                {route.difficulty || "Unrated"} Difficulty
              </Text>
            </View>
            <View className='w-1/2 flex-row items-center'>
              <TrendingUp color={colors.textMuted} size={18} className='mr-2' />
              <Text style={{ color: colors.textMuted }}>
                +{route.elevation_gain_m || 0}m Elevation
              </Text>
            </View>
          </View>
        </View>

        <View className='p-5 mb-10'>
          <Text
            className='text-xl font-bold mb-3'
            style={{ color: colors.text }}
          >
            Geographical Profile
          </Text>
          <Text className='leading-6 mb-4' style={{ color: colors.textMuted }}>
            This route spans a total of {route.distance_km || 0} kilometers and
            climbs {route.elevation_gain_m || 0} meters. It was crowdsourced
            from {route.creator_name}'s live GPS telemetry.
          </Text>
          <View
            className='p-4 rounded-xl'
            style={{
              backgroundColor: colors.primary + "1A",
              borderWidth: 1,
              borderColor: colors.primary + "4D",
            }}
          >
            <Text className='font-bold mb-1' style={{ color: colors.primary }}>
              Route Status
            </Text>
            <Text className='text-sm' style={{ color: colors.primary }}>
              Safe to Ride — Confirmed by community
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
