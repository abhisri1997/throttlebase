import React, { memo, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Motorbike } from "lucide-react-native";
import { Marker } from "../../../components/MapWrapper";
import { peerAppearance } from "../core/peerAppearance";
import type { PeerLocation } from "../hooks/useRideParticipants";

/** Above the route and stops, below the rider's own puck. */
const PEER_Z_INDEX = 50;

/**
 * How long each marker keeps redrawing itself after mount.
 *
 * A custom marker view is rasterised and then frozen, which is what
 * `tracksViewChanges={false}` buys: leaving it on re-rasterises every marker on
 * every frame and visibly costs frames once a few riders are moving. Freezing
 * immediately is the trap, though -- on Android the first rasterisation often
 * happens before the icon and text have laid out, leaving a blank pin, which is
 * why this previously fell back to a plain coloured pin there. Tracking briefly
 * and then stopping gets a drawn marker at a cost paid once.
 */
const SETTLE_MS = 1200;

const describeSpeed = (speedKmh: number | null): string =>
  speedKmh === null ? "Live rider" : `${speedKmh.toFixed(1)} km/h`;

export interface PeerMarkersProps {
  peers: readonly PeerLocation[];
  focusedRiderId: string | null;
  /** Ring drawn around whoever the crew list has focused. */
  focusedColor: string;
}

interface PeerMarkerProps {
  peer: PeerLocation;
  isFocused: boolean;
  focusedColor: string;
}

const PeerMarker = memo(function PeerMarker({
  peer,
  isFocused,
  focusedColor,
}: PeerMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const { color, initial } = peerAppearance(peer.riderId, peer.displayName);

  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={{ latitude: peer.lat, longitude: peer.lon }}
      title={peer.displayName}
      description={describeSpeed(peer.speedKmh)}
      zIndex={PEER_Z_INDEX}
      tracksViewChanges={tracksViewChanges}
      // Keeps the bike over the rider's position rather than above it.
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.marker}>
        <View
          style={[
            styles.badge,
            { backgroundColor: color },
            isFocused ? { borderColor: focusedColor, borderWidth: 3 } : null,
          ]}
        >
          <Motorbike color="#FFFFFF" size={16} />
        </View>

        <View style={styles.nameChip}>
          <Text style={styles.nameText} numberOfLines={1}>
            {peer.displayName || initial}
          </Text>
        </View>
      </View>
    </Marker>
  );
});

/**
 * The other riders in the session, each with their own colour so they can be
 * told apart while moving. Identical on both platforms.
 */
export const PeerMarkers = memo(function PeerMarkers({
  peers,
  focusedRiderId,
  focusedColor,
}: PeerMarkersProps) {
  return (
    <>
      {peers.map((peer) => (
        <PeerMarker
          key={peer.riderId}
          peer={peer}
          isFocused={peer.riderId === focusedRiderId}
          focusedColor={focusedColor}
        />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  marker: {
    alignItems: "center",
    // Room for the chip, so neither it nor the badge is clipped by the
    // marker's own bounds on Android.
    paddingBottom: 2,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 4 },
    }),
  },
  nameChip: {
    marginTop: 2,
    maxWidth: 96,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  nameText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
});
