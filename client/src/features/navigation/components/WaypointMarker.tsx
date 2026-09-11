import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, Flag } from "lucide-react-native";
import { Marker } from "../../../components/MapWrapper";
import type { NavigationColors } from "../../../theme/navigationColors";
import type { WaypointStatus } from "../core/navigationSession";
import type { StopCategory, TripWaypoint } from "../core/tripPlan";

const CATEGORY_EMOJI: Readonly<Record<StopCategory, string>> = {
  fuel: "⛽",
  rest: "☕",
  photo: "📸",
  unplanned: "📍",
};

const NEXT_BADGE_SIZE = 34;
const BADGE_SIZE = 26;
const CATEGORY_CHIP_SIZE = 18;
/** Room around the badge for the category chip, so the snapshot never clips it. */
const CONTAINER_PADDING = 8;
const CENTER_ANCHOR = { x: 0.5, y: 0.5 };

/** Markers always draw above polylines; among themselves, the next stop wins. */
const Z_INDEX: Readonly<Record<WaypointStatus, number>> = {
  next: 30,
  upcoming: 20,
  visited: 10,
};

/**
 * Android snapshots a child-view marker into a bitmap. It has to track view
 * changes until that snapshot is drawn — or the marker comes out blank — and
 * then stop, or it re-snapshots on every frame.
 */
const TRACK_VIEW_CHANGES_MS = 600;

const useTracksViewChanges = (renderKey: string): boolean => {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_VIEW_CHANGES_MS);
    return () => clearTimeout(timer);
  }, [renderKey]);

  return tracksViewChanges;
};

const badgeColor = (
  waypoint: TripWaypoint,
  status: WaypointStatus,
  colors: NavigationColors,
): string => {
  if (status === "visited") return colors.waypointVisited;
  if (waypoint.kind === "start") return colors.waypointStart;
  if (waypoint.kind === "destination") return colors.waypointDestination;
  return colors.waypointStop;
};

const accessibilityLabelFor = (waypoint: TripWaypoint, status: WaypointStatus): string => {
  const place =
    waypoint.kind === "stop" ? `Stop ${waypoint.stopNumber ?? ""}, ${waypoint.name}` : waypoint.name;
  const state = status === "visited" ? "done" : status;
  return `${place}, ${state}`;
};

interface BadgeContentProps {
  waypoint: TripWaypoint;
  status: WaypointStatus;
  size: number;
  colors: NavigationColors;
}

const BadgeContent = ({ waypoint, status, size, colors }: BadgeContentProps) => {
  const iconSize = Math.round(size * 0.5);

  if (status === "visited") {
    return <Check color={colors.waypointOutline} size={iconSize} strokeWidth={3} />;
  }
  if (waypoint.kind === "destination") {
    return <Flag color={colors.waypointOutline} size={iconSize} strokeWidth={2.5} />;
  }
  if (waypoint.kind === "start") {
    return <View style={[styles.startDot, { backgroundColor: colors.waypointOutline }]} />;
  }

  return (
    <Text
      style={[styles.number, { color: colors.waypointOutline, fontSize: Math.round(size * 0.46) }]}
    >
      {waypoint.stopNumber ?? ""}
    </Text>
  );
};

export interface WaypointMarkerProps {
  waypoint: TripWaypoint;
  status: WaypointStatus;
  colors: NavigationColors;
}

/**
 * A trip waypoint: a numbered badge for stops with the category alongside, a
 * flag for the destination, a check once reached. The next waypoint is drawn
 * larger so it stands out from the rest of the trip.
 */
export const WaypointMarker = memo(function WaypointMarker({
  waypoint,
  status,
  colors,
}: WaypointMarkerProps) {
  const size = status === "next" ? NEXT_BADGE_SIZE : BADGE_SIZE;
  const containerSize = size + CONTAINER_PADDING * 2;
  const fill = badgeColor(waypoint, status, colors);
  const tracksViewChanges = useTracksViewChanges(`${status}:${fill}`);
  const category = waypoint.kind === "stop" && status !== "visited" ? waypoint.category : null;

  return (
    <Marker
      coordinate={waypoint.coordinate}
      title={waypoint.stopNumber ? `${waypoint.stopNumber}. ${waypoint.name}` : waypoint.name}
      anchor={CENTER_ANCHOR}
      zIndex={Z_INDEX[status]}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        accessible
        accessibilityLabel={accessibilityLabelFor(waypoint, status)}
        style={[styles.container, { width: containerSize, height: containerSize }]}
      >
        <View
          style={[
            styles.badge,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fill,
              borderColor: colors.waypointOutline,
            },
          ]}
        >
          <BadgeContent waypoint={waypoint} status={status} size={size} colors={colors} />
        </View>

        {category ? (
          <View style={[styles.categoryChip, { borderColor: fill }]}>
            <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[category]}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
  },
  startDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  number: {
    fontWeight: "800",
    includeFontPadding: false,
  },
  categoryChip: {
    position: "absolute",
    top: 0,
    right: 0,
    width: CATEGORY_CHIP_SIZE,
    height: CATEGORY_CHIP_SIZE,
    borderRadius: CATEGORY_CHIP_SIZE / 2,
    borderWidth: 1.5,
    backgroundColor: "rgb(255, 255, 255)",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryEmoji: {
    fontSize: 10,
    includeFontPadding: false,
  },
});
