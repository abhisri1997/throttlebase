import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Route, Users, X } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { WaypointStatus } from "../core/navigationSession";
import type { TripWaypoint } from "../core/tripPlan";
import type { RideParticipantView } from "../types/navigation";
import { formatClockTime } from "../core/format";
import { isFinishedProgress, progressLabel } from "../../rides/core/riderProgress";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Collapsed trip bar height above the home indicator. */
const COLLAPSED_BASE_HEIGHT = 136;
const EXPANDED_MAX_SCREEN_SHARE = 0.76;
const EXPANDED_MARGIN = 8;
const FLING_VELOCITY = 0.35;
const ROUND_BUTTON_SIZE = 44;

export const navigationSheetCollapsedHeight = (bottomInset: number): number =>
  COLLAPSED_BASE_HEIGHT + bottomInset;

export interface TripBarAction {
  label: string;
  onPress: () => void;
  isBusy?: boolean;
}

interface NavigationBottomSheetProps {
  rideName: string;
  participants: RideParticipantView[];
  isHost: boolean;
  canEndRide: boolean;
  onEndRide: () => void;
  ending: boolean;
  focusedParticipantId?: string | null;
  onParticipantPress?: (participant: RideParticipantView) => void;
  /** The trip's waypoints, listed in order so any one can be found on the map. */
  waypoints: readonly TripWaypoint[];
  waypointStatuses: readonly WaypointStatus[];
  focusedWaypointId?: string | null;
  onWaypointPress?: (waypoint: TripWaypoint) => void;
  onSnapHeightChange?: (height: number) => void;
  /** Trip bar: time to the next waypoint, e.g. "12 min". */
  durationLabel: string;
  /** Trip bar: e.g. "4.4 km · to Stop 2 · Indian Oil · arrive 4:58 PM". */
  detailLabel: string;
  onExit: () => void;
  onOverview: () => void;
  isOverview: boolean;
  /** Start ride, Skip stop, or Continue — whichever applies now. */
  action: TripBarAction | null;
  /** This rider's own ride: finish it, or take a finish back while the group rides on. */
  myRide?: MyRideControls;
}

export interface MyRideControls {
  isRiding: boolean;
  isFinished: boolean;
  /** The group ride is still live, so a finish can be taken back. */
  canResume: boolean;
  onFinish: () => void;
  onResume: () => void;
  isBusy: boolean;
}

const ROLE_LABELS: Record<RideParticipantView["role"], string> = {
  captain: "Captain",
  co_captain: "Co-Captain",
  member: "Rider",
};

interface RoundButtonProps {
  label: string;
  onPress: () => void;
  isActive?: boolean;
  children: ReactNode;
}

function RoundButton({ label, onPress, isActive = false, children }: RoundButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={[
        styles.roundButton,
        { backgroundColor: isActive ? colors.primary : colors.bg, borderColor: colors.border },
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}

/**
 * The trip bar with the crew below it, as in Google Maps: collapsed it shows
 * the time and distance to the next waypoint with Exit, Overview and the
 * current action; dragged up it lists the crew and the captain's controls.
 */
export function NavigationBottomSheet({
  rideName,
  participants,
  isHost,
  canEndRide,
  onEndRide,
  ending,
  focusedParticipantId,
  onParticipantPress,
  waypoints,
  waypointStatuses,
  focusedWaypointId,
  onWaypointPress,
  onSnapHeightChange,
  durationLabel,
  detailLabel,
  onExit,
  onOverview,
  isOverview,
  action,
  myRide,
}: NavigationBottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [chromeHeight, setChromeHeight] = useState(COLLAPSED_BASE_HEIGHT);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const onlineCount = participants.filter((participant) => participant.isOnline).length;

  const collapsedHeight = navigationSheetCollapsedHeight(insets.bottom);
  const expandedHeight = clamp(
    chromeHeight + scrollContentHeight + insets.bottom,
    collapsedHeight,
    Math.round(windowHeight * EXPANDED_MAX_SCREEN_SHARE),
  );
  const snapThreshold = (collapsedHeight + expandedHeight) / 2;

  const heightValue = useRef(new Animated.Value(collapsedHeight)).current;
  const dragStartHeight = useRef(collapsedHeight);

  const snapToHeight = useCallback(
    (targetHeight: number) => {
      setIsExpanded(targetHeight > collapsedHeight + EXPANDED_MARGIN);
      Animated.spring(heightValue, {
        toValue: targetHeight,
        damping: 24,
        stiffness: 220,
        useNativeDriver: false,
      }).start();
    },
    [collapsedHeight, heightValue],
  );

  const toggle = useCallback(() => {
    heightValue.stopAnimation((value: number) => {
      snapToHeight(value > snapThreshold ? collapsedHeight : expandedHeight);
    });
  }, [collapsedHeight, expandedHeight, heightValue, snapThreshold, snapToHeight]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          heightValue.stopAnimation((value: number) => {
            dragStartHeight.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          heightValue.setValue(
            clamp(dragStartHeight.current - gesture.dy, collapsedHeight, expandedHeight),
          );
        },
        onPanResponderRelease: (_, gesture) => {
          const currentHeight = clamp(
            dragStartHeight.current - gesture.dy,
            collapsedHeight,
            expandedHeight,
          );
          const shouldExpand = currentHeight > snapThreshold || gesture.vy < -FLING_VELOCITY;
          snapToHeight(shouldExpand ? expandedHeight : collapsedHeight);
        },
      }),
    [collapsedHeight, expandedHeight, heightValue, snapThreshold, snapToHeight],
  );

  useEffect(() => {
    if (!onSnapHeightChange) return;

    const listenerId = heightValue.addListener(({ value }) => {
      onSnapHeightChange(Math.round(value));
    });
    return () => heightValue.removeListener(listenerId);
  }, [heightValue, onSnapHeightChange]);

  // Keep the sheet within bounds when they change — content grows, or the safe area arrives.
  useEffect(() => {
    heightValue.stopAnimation((value: number) => {
      const bounded = clamp(value, collapsedHeight, expandedHeight);
      if (bounded !== value) heightValue.setValue(bounded);
      setIsExpanded(bounded > collapsedHeight + EXPANDED_MARGIN);
    });
  }, [collapsedHeight, expandedHeight, heightValue]);

  return (
    <>
      {isExpanded ? (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Collapse crew panel'
          onPress={() => snapToHeight(collapsedHeight)}
          style={styles.dismissOverlay}
        />
      ) : null}

      <Animated.View
        style={[
          styles.sheet,
          {
            height: heightValue,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
      <View
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setChromeHeight((previous) =>
            Math.abs(previous - nextHeight) > 2 ? nextHeight : previous,
          );
        }}
      >
        <Pressable
          onPress={toggle}
          accessibilityRole='button'
          accessibilityLabel={isExpanded ? "Collapse crew panel" : "Expand crew panel"}
          {...panResponder.panHandlers}
          style={styles.header}
        >
          <View style={[styles.handle, { backgroundColor: colors.textMuted }]} />

          <View style={styles.tripRow}>
            <RoundButton label='Exit navigation' onPress={onExit}>
              <X color={colors.text} size={22} />
            </RoundButton>

            <View style={styles.tripText}>
              <Text style={[styles.duration, { color: colors.primary }]} numberOfLines={1}>
                {durationLabel}
              </Text>
              <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>
                {detailLabel}
              </Text>
            </View>

            <RoundButton
              label={isOverview ? "Back to your position" : "Show route overview"}
              onPress={onOverview}
              isActive={isOverview}
            >
              <Route color={isOverview ? "white" : colors.text} size={20} />
            </RoundButton>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              accessibilityRole='button'
              accessibilityLabel={`Crew, ${onlineCount} of ${participants.length} online`}
              onPress={toggle}
              style={[styles.chip, { backgroundColor: colors.bg, borderColor: colors.border }]}
            >
              <Users color={colors.text} size={14} />
              <Text style={[styles.chipText, { color: colors.text }]}>
                Crew · {onlineCount}/{participants.length} online
              </Text>
            </TouchableOpacity>

            {action ? (
              <TouchableOpacity
                accessibilityRole='button'
                accessibilityState={{ disabled: Boolean(action.isBusy) }}
                onPress={action.onPress}
                disabled={action.isBusy}
                style={[
                  styles.chip,
                  styles.actionChip,
                  { backgroundColor: colors.primary, opacity: action.isBusy ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.chipText, styles.actionText]}>{action.label}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Pressable>
      </View>

      <ScrollView
        style={[styles.scroll, { opacity: isExpanded ? 1 : 0 }]}
        scrollEnabled={isExpanded}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 18 }}
        onContentSizeChange={(_, contentHeight) => {
          const nextHeight = Math.round(contentHeight);
          setScrollContentHeight((previous) =>
            Math.abs(previous - nextHeight) > 2 ? nextHeight : previous,
          );
        }}
      >
        <View className='mb-3 flex-row items-center justify-between'>
          <Text className='text-sm font-bold' style={{ color: colors.text }} numberOfLines={1}>
            {rideName}
          </Text>
          <Text className='text-xs' style={{ color: colors.textMuted }}>
            {participants.length} riders
          </Text>
        </View>

        {waypoints.length > 0 ? (
          <View className='mb-4'>
            <Text className='text-xs font-bold mb-2' style={{ color: colors.textMuted }}>
              STOPS
            </Text>

            {waypoints.map((waypoint, index) => {
              const status = waypointStatuses[index] ?? "upcoming";
              const isFocused = focusedWaypointId === waypoint.id;

              return (
                <Pressable
                  key={waypoint.id}
                  accessibilityRole='button'
                  accessibilityLabel={`Show ${waypoint.name} on the map`}
                  onPress={() => onWaypointPress?.(waypoint)}
                  className='flex-row items-center justify-between p-3 rounded-xl mb-2'
                  style={{
                    backgroundColor: colors.bg,
                    borderWidth: 1,
                    borderColor: isFocused ? colors.primary : colors.border,
                  }}
                >
                  <View className='flex-row items-center flex-1 pr-2'>
                    <View
                      style={[
                        styles.stopBadge,
                        {
                          backgroundColor:
                            status === "visited"
                              ? colors.textMuted
                              : status === "next"
                                ? colors.primary
                                : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.stopBadgeText}>
                        {status === "visited" ? "✓" : (waypoint.stopNumber ?? "·")}
                      </Text>
                    </View>

                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.text,
                        fontWeight: status === "next" ? "700" : "400",
                        flex: 1,
                      }}
                    >
                      {waypoint.name}
                    </Text>
                  </View>

                  <Text
                    className='text-xs'
                    style={{ color: status === "next" ? colors.primary : colors.textMuted }}
                  >
                    {isFocused ? "On map" : status === "visited" ? "Done" : status === "next" ? "Next" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {participants.map((participant) => {
          const isFocused = focusedParticipantId === participant.riderId;

          return (
            <Pressable
              key={participant.riderId}
              accessibilityRole='button'
              accessibilityLabel={`Show ${participant.displayName} on the map`}
              onPress={() => onParticipantPress?.(participant)}
              className='flex-row items-center justify-between p-3 rounded-xl mb-2'
              style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
            >
              <View className='flex-row items-center'>
                <View
                  style={[
                    styles.presenceDot,
                    { backgroundColor: participant.isOnline ? colors.primary : colors.textMuted },
                  ]}
                />
                <Text style={{ color: colors.text, fontWeight: isFocused ? "700" : "400" }}>
                  {participant.displayName}
                </Text>
              </View>
              <Text
                className='text-xs'
                style={{
                  color: isFocused
                    ? colors.primary
                    : participant.progress === "left_early"
                      ? colors.danger
                      : isFinishedProgress(participant.progress)
                        ? colors.primary
                        : colors.textMuted,
                }}
              >
                {isFocused
                  ? "On map"
                  : `${ROLE_LABELS[participant.role]} · ${progressLabel(
                      {
                        progress: participant.progress,
                        finishedAt: participant.finishedAt,
                        isOnline: participant.isOnline,
                      },
                      formatClockTime,
                    )}`}
              </Text>
            </Pressable>
          );
        })}

        {myRide?.isRiding ? (
          <TouchableOpacity
            accessibilityRole='button'
            accessibilityLabel='Finish my ride'
            onPress={myRide.onFinish}
            disabled={myRide.isBusy}
            className='rounded-xl items-center py-3 mt-3'
            style={{
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.primary,
              opacity: myRide.isBusy ? 0.7 : 1,
            }}
          >
            <Text className='font-bold' style={{ color: colors.primary }}>
              {myRide.isBusy ? "Finishing…" : "Finish my ride"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {myRide?.isFinished && myRide.canResume ? (
          <TouchableOpacity
            accessibilityRole='button'
            accessibilityLabel='Resume my ride'
            onPress={myRide.onResume}
            disabled={myRide.isBusy}
            className='rounded-xl items-center py-3 mt-3'
            style={{
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: myRide.isBusy ? 0.7 : 1,
            }}
          >
            <Text className='font-semibold' style={{ color: colors.text }}>
              {myRide.isBusy ? "Resuming…" : "Resume my ride"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {participants.length === 0 ? (
          <View
            className='rounded-2xl px-4 py-5'
            style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
          >
            <Text className='text-sm' style={{ color: colors.textMuted }}>
              Live participants will appear here once the session starts.
            </Text>
          </View>
        ) : null}

        {isHost && canEndRide ? (
          <TouchableOpacity
            accessibilityRole='button'
            onPress={onEndRide}
            disabled={ending}
            className='rounded-xl items-center py-3 mt-3'
            style={{ backgroundColor: colors.danger, opacity: ending ? 0.7 : 1 }}
          >
            <Text className='font-bold text-white'>{ending ? "Ending Ride..." : "End Ride"}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dismissOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 25,
    elevation: 25,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  roundButton: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tripText: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  duration: {
    fontSize: 22,
    fontWeight: "800",
  },
  detail: {
    fontSize: 13,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
  },
  actionChip: {
    borderWidth: 0,
  },
  actionText: {
    color: "white",
    marginLeft: 0,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  presenceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  stopBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  stopBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
});
