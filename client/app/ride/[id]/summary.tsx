import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../src/api/client";
import { useTheme } from "../../../src/theme/ThemeContext";
import MapView, { Polyline, PROVIDER_GOOGLE } from "../../../src/components/MapWrapper";
import { simplifyPolyline } from "../../../src/features/navigation/services/navigationRouteService";
import { useRideTrack } from "../../../src/features/navigation/hooks/useRideTrack";
import { isTrackTooShort, rideStats } from "../../../src/features/rides/core/rideStats";
import { SaveRouteCard } from "../../../src/features/rides/components/SaveRouteCard";

const fetchRide = async (id: string) => (await apiClient.get(`/api/rides/${id}`)).data.ride;

const MAP_EDGE_PADDING = { top: 40, right: 40, bottom: 40, left: 40 };

/**
 * Where a rider lands when their ride ends: the road they rode and how it
 * went. Navigation is replaced, not stacked, so Back never returns to a ride
 * that is over. While the group is still riding, they can follow it.
 */
export default function RideSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);

  // A track fetched mid-ride is cached as final; the finished one replaces it.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["ride-track", id] });
  }, [id, queryClient]);

  const ride = useQuery({ queryKey: ["ride", id], queryFn: () => fetchRide(id!), enabled: Boolean(id) });
  const { track, isError } = useRideTrack(id, true);

  const coordinates = useMemo(
    () => (track && track.coordinates.length > 1 ? simplifyPolyline(track.coordinates, 15, 800) : []),
    [track],
  );
  const stats = track && !isTrackTooShort(track) ? rideStats(track) : null;
  const rideIsOver = ride.data?.status === "completed";

  const fitMap = (): void => {
    if (coordinates.length > 1) {
      mapRef.current?.fitToCoordinates(coordinates, { edgePadding: MAP_EDGE_PADDING, animated: false });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.primary }]}>{rideIsOver ? "Ride complete" : "You've finished"}</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {ride.data?.title ?? "Your ride"}
        </Text>
        {!rideIsOver && ride.data ? (
          <Text style={[styles.note, { color: colors.textMuted }]}>The rest of the group is still riding.</Text>
        ) : null}

        {coordinates.length > 1 ? (
          <View style={[styles.mapFrame, { borderColor: colors.border }]}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              onMapReady={fitMap}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polyline coordinates={coordinates} strokeColor={colors.primary} strokeWidth={4} />
            </MapView>
          </View>
        ) : null}

        {!track && !isError ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
        ) : stats ? (
          <View style={styles.grid}>
            {stats.map((stat) => (
              <View key={stat.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            {isError
              ? "Couldn't load your ride's stats. They'll be on the ride's page."
              : "Not enough of this ride was recorded to show stats."}
          </Text>
        )}

        {rideIsOver && coordinates.length > 1 ? <SaveRouteCard rideId={id!} rideTitle={ride.data?.title} /> : null}
      </ScrollView>

      <View style={styles.actions}>
        {!rideIsOver && ride.data?.status === "active" ? (
          <TouchableOpacity
            accessibilityRole='button'
            onPress={() => router.replace(`/ride/${id}/navigation` as any)}
            style={[styles.secondary, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontWeight: "700" }}>Follow the group</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityRole='button'
          onPress={() => router.replace(`/ride/${id}` as any)}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  kicker: { fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
  title: { fontSize: 26, fontWeight: "800" },
  note: { fontSize: 14, lineHeight: 20 },
  mapFrame: { height: 220, borderRadius: 16, overflow: "hidden", borderWidth: 1 },
  map: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 14 },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 13, marginTop: 2 },
  actions: { flexDirection: "row", gap: 12, padding: 16 },
  primary: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: "center", borderWidth: 1 },
});
