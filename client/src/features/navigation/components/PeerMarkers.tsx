import React, { memo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Motorbike } from "lucide-react-native";
import { Marker } from "../../../components/MapWrapper";
import type { PeerLocation } from "../hooks/useRideParticipants";

/** Above the route and stops, below the rider's own puck. */
const PEER_Z_INDEX = 50;

const describeSpeed = (speedKmh: number | null): string =>
  speedKmh === null ? "Live rider" : `${speedKmh.toFixed(1)} km/h`;

export interface PeerMarkersProps {
  peers: readonly PeerLocation[];
  focusedRiderId: string | null;
  color: string;
  focusedColor: string;
}

/** The other riders in the session. Android draws a tinted pin; iOS a badge. */
export const PeerMarkers = memo(function PeerMarkers({
  peers,
  focusedRiderId,
  color,
  focusedColor,
}: PeerMarkersProps) {
  return (
    <>
      {peers.map((peer) => {
        const fill = peer.riderId === focusedRiderId ? focusedColor : color;

        return (
          <Marker
            key={peer.riderId}
            coordinate={{ latitude: peer.lat, longitude: peer.lon }}
            title={peer.displayName}
            description={describeSpeed(peer.speedKmh)}
            zIndex={PEER_Z_INDEX}
            tracksViewChanges={false}
            pinColor={Platform.OS === "android" ? fill : undefined}
          >
            {Platform.OS !== "android" ? (
              <View style={[styles.badge, { backgroundColor: fill }]}>
                <Motorbike color='white' size={16} />
              </View>
            ) : null}
          </Marker>
        );
      })}
    </>
  );
});

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    padding: 6,
  },
});
