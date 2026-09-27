import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
} from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { goBackOr } from "../../src/utils/goBack";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { buildShareLinks } from "../../src/utils/shareLinks";
import { formatDistance } from "../../src/features/navigation/core/format";
import MapView, {
  Polyline,
  Marker,
  PROVIDER_GOOGLE,
} from "../../src/components/MapWrapper";
import { ChevronLeft, Bookmark, Share2 } from "lucide-react-native";
import { HighlightChips } from "../../src/features/routes/components/HighlightChips";
import { ITINERARY_COLORS, RouteItinerary } from "../../src/features/routes/components/RouteItinerary";
import { itineraryRows, routeFacts, type RouteStopDetail } from "../../src/features/routes/core/routeSummary";
import { useTheme } from "../../src/theme/ThemeContext";
import { PlanRideSection } from "../../src/features/routes/components/PlanRideSection";
import { parseRideDirection, type RideDirection } from "../../src/features/routes/core/planRide";

const fetchRouteDetails = async (id: string) => {
  const { data } = await apiClient.get(`/api/routes/${id}`);
  return data;
};

const bookmarkRoute = async (id: string) => {
  const { data } = await apiClient.post(`/api/routes/${id}/bookmark`);
  return data;
};

const START_COLOR = ITINERARY_COLORS.start;
const DESTINATION_COLOR = ITINERARY_COLORS.destination;
const STOP_COLOR = ITINERARY_COLORS.stop;
const MAP_EDGE_PADDING = { top: 90, right: 50, bottom: 50, left: 50 };

/** A lettered or numbered map pin: A (start), 1, 2… (stops), B (destination). */
function EndpointMarker({ letter, color, textColor = "#ffffff" }: { letter: string; color: string; textColor?: string }) {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: textColor, fontWeight: "800", fontSize: 14 }}>{letter}</Text>
    </View>
  );
}

export default function RouteDetailScreen() {
  const { colors } = useTheme();
  const { id, direction: directionParam } = useLocalSearchParams<{ id: string; direction?: string }>();
  const router = useRouter();
  // Found by searching the other way round: ready to be ridden that way.
  const [direction, setDirection] = useState<RideDirection>(() => parseRideDirection(directionParam));
  const queryClient = useQueryClient();
  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);

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
          onPress={() => goBackOr(router, "/(tabs)/routes")}
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
  const distanceKm = Number(route.distance_km);
  const distanceLabel = Number.isFinite(distanceKm) && distanceKm > 0 ? formatDistance(distanceKm * 1000) : null;
  const stops: (RouteStopDetail & { lat: number; lng: number })[] = Array.isArray(route.stops) ? route.stops : [];
  const facts = routeFacts({
    title: route.title,
    start_name: route.start_name ?? null,
    end_name: route.end_name ?? null,
    distance_km: route.distance_km ?? null,
    ridden_duration_s: route.ridden_duration_s ?? null,
    via: Array.isArray(route.via) ? route.via : [],
    highlights: [],
  });
  const itinerary = itineraryRows({
    start_name: route.start_name ?? null,
    end_name: route.end_name ?? null,
    distance_km: route.distance_km ?? null,
    stops,
  });
  const highlights: string[] = Array.isArray(route.highlights) ? route.highlights : [];

  // Show the whole route, not a fixed zoom around its start.
  const fitMapToRoute = () => {
    if (mapCoords.length > 1) {
      mapRef.current?.fitToCoordinates(mapCoords, { edgePadding: MAP_EDGE_PADDING, animated: false });
    }
  };

  const handleShare = async () => {
    const { primaryLink } = buildShareLinks(
      `/route/${route.id}`,
      (path) => Linking.createURL(path, { scheme: "throttlebase" }),
      process.env.EXPO_PUBLIC_SHARE_BASE_URL,
    );
    try {
      await Share.share({
        title: route.title,
        message: `${route.title}${distanceLabel ? ` · ${distanceLabel}` : ""} on ThrottleBase: ${primaryLink}`,
        url: primaryLink,
      });
    } catch (error) {
      Alert.alert("Couldn't share", getApiErrorMessage(error, "Try again in a moment."));
    }
  };

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      {/* Map Header */}
      <View className='h-2/5 w-full relative'>
        {mapCoords.length > 0 ? (
          <MapView
            ref={mapRef}
            onMapReady={fitMapToRoute}
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
            <Marker coordinate={startCoord} title='A · Start' anchor={{ x: 0.5, y: 0.5 }}>
              <EndpointMarker letter='A' color={START_COLOR} />
            </Marker>
            <Marker coordinate={endCoord} title='B · Destination' anchor={{ x: 0.5, y: 0.5 }}>
              <EndpointMarker letter='B' color={DESTINATION_COLOR} />
            </Marker>
            {stops.map((stop) => (
              <Marker
                key={`stop-${stop.position}`}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                title={`${stop.position} · ${stop.name ?? "Stop"}`}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <EndpointMarker letter={String(stop.position)} color={STOP_COLOR} textColor='#0f172a' />
              </Marker>
            ))}
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
            onPress={() => goBackOr(router, "/(tabs)/routes")}
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
              onPress={handleShare}
              accessibilityRole='button'
              accessibilityLabel='Share route'
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
          <Text className='text-3xl font-bold' style={{ color: colors.text }}>
            {route.title}
          </Text>
          {route.start_name && route.end_name ? (
            <Text className='text-base mt-1' style={{ color: colors.text }}>
              {route.start_name} → {route.end_name}
            </Text>
          ) : null}
          {facts.length > 0 ? (
            <Text className='text-sm font-semibold mt-3' style={{ color: colors.text }}>
              {facts.join("  ·  ")}
            </Text>
          ) : null}
          <Text className='text-sm mt-2' style={{ color: colors.textMuted }}>
            Saved by{" "}
            <Text className='font-bold' style={{ color: colors.text }}>
              {route.creator_name}
            </Text>{" "}
            on {dateStr}
          </Text>
          <PlanRideSection
            startName={route.start_name ?? null}
            endName={route.end_name ?? null}
            direction={direction}
            onDirectionChange={setDirection}
            onPlan={() =>
              router.push({ pathname: "/(modals)/create-ride", params: { routeId: route.id, direction } } as any)
            }
          />
        </View>

        {highlights.length > 0 ? (
          <View className='px-5 pt-5' style={{ gap: 8 }}>
            <Text className='text-xl font-bold' style={{ color: colors.text }}>
              Highlights
            </Text>
            <HighlightChips highlights={highlights} />
            {/* The saver's view, never the app's claim. */}
            <Text className='text-xs' style={{ color: colors.textMuted }}>
              {route.creator_name}'s own view of the ride.
            </Text>
          </View>
        ) : null}

        <View className='p-5' style={{ gap: 12 }}>
          <Text className='text-xl font-bold' style={{ color: colors.text }}>
            Itinerary
          </Text>
          <RouteItinerary rows={itinerary} />
        </View>

        <View className='px-5 pb-10'>
          {/* Only what is known: where it came from. Nothing here rates the
              road, and nothing claims it is safe. */}
          <Text className='text-sm leading-5' style={{ color: colors.textMuted }}>
            {route.ride_id
              ? `Recorded on ${route.creator_name}'s ride. Distances are measured along the road they rode.`
              : `Saved by ${route.creator_name}.`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
