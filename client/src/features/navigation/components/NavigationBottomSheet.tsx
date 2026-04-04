import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../theme/ThemeContext";
import type { RideParticipantView } from "../types/navigation";

type Props = {
  rideName: string;
  participants: RideParticipantView[];
  isHost: boolean;
  canEndRide: boolean;
  onEndRide: () => void;
  ending: boolean;
  focusedParticipantId?: string | null;
  onParticipantPress?: (participant: RideParticipantView) => void;
  onExpandedChange?: (expanded: boolean) => void;
  onSnapHeightChange?: (height: number) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const NAVIGATION_SHEET_COLLAPSED_HEIGHT = 138;

export function NavigationBottomSheet({
  rideName,
  participants,
  isHost,
  canEndRide,
  onEndRide,
  ending,
  focusedParticipantId,
  onParticipantPress,
  onExpandedChange,
  onSnapHeightChange,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [chromeHeight, setChromeHeight] = useState(NAVIGATION_SHEET_COLLAPSED_HEIGHT);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const onlineCount = participants.filter((participant) => participant.isOnline).length;

  const collapsedHeight = NAVIGATION_SHEET_COLLAPSED_HEIGHT;
  const expandedHeight = clamp(
    chromeHeight + scrollContentHeight + insets.bottom,
    collapsedHeight,
    Math.round(windowHeight * 0.76),
  );
  const snapThreshold = (collapsedHeight + expandedHeight) / 2;

  const heightValue = useRef(new Animated.Value(collapsedHeight)).current;
  const dragStartHeight = useRef(collapsedHeight);

  const snapToHeight = (targetHeight: number) => {
    const nextExpanded = targetHeight > collapsedHeight + 8;
    setIsExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
    Animated.spring(heightValue, {
      toValue: targetHeight,
      damping: 24,
      stiffness: 220,
      useNativeDriver: false,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          heightValue.stopAnimation((value: number) => {
            dragStartHeight.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const nextHeight = clamp(
            dragStartHeight.current - gesture.dy,
            collapsedHeight,
            expandedHeight,
          );
          heightValue.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gesture) => {
          const currentHeight = clamp(
            dragStartHeight.current - gesture.dy,
            collapsedHeight,
            expandedHeight,
          );
          const shouldExpand = currentHeight > snapThreshold || gesture.vy < -0.35;
          snapToHeight(shouldExpand ? expandedHeight : collapsedHeight);
        },
      }),
    [collapsedHeight, expandedHeight, heightValue, snapThreshold],
  );

  useEffect(() => {
    if (!onSnapHeightChange) {
      return;
    }

    const listenerId = heightValue.addListener(({ value }) => {
      onSnapHeightChange(Math.round(value));
    });

    return () => {
      heightValue.removeListener(listenerId);
    };
  }, [heightValue, onSnapHeightChange]);

  useEffect(() => {
    heightValue.stopAnimation((value: number) => {
      if (value > expandedHeight) {
        heightValue.setValue(expandedHeight);
      }

      const nextExpanded = value > collapsedHeight + 8;
      setIsExpanded(nextExpanded);
      onExpandedChange?.(nextExpanded);
    });
  }, [
    collapsedHeight,
    expandedHeight,
    heightValue,
    onExpandedChange,
  ]);

  return (
    <Animated.View
      className='rounded-t-3xl'
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        elevation: 30,
        height: heightValue,
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        overflow: "hidden",
      }}
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
          onPress={() => {
            heightValue.stopAnimation((value: number) => {
              const next = value > snapThreshold ? collapsedHeight : expandedHeight;
              snapToHeight(next);
            });
          }}
          {...panResponder.panHandlers}
          className='pt-3 pb-4 px-4'
        >
          <View className='items-center'>
            <View
              style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: colors.textMuted }}
            />
          </View>

          <View className='mt-4 flex-row items-start justify-between'>
            <View className='flex-1 pr-3'>
              <Text className='text-lg font-bold' style={{ color: colors.text }} numberOfLines={1}>
                {rideName}
              </Text>
              <Text className='mt-1 text-xs' style={{ color: colors.textMuted }}>
                {onlineCount}/{participants.length || 0} riders online
              </Text>
            </View>

            <View
              className='rounded-full px-3 py-1.5'
              style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
            >
              <Text className='text-xs font-semibold' style={{ color: colors.text }}>
                {isExpanded ? "Collapse" : "Crew"}
              </Text>
            </View>
          </View>

          <Text className='mt-3 text-xs' style={{ color: colors.textMuted }}>
            {isExpanded ? "Tap or drag down to return to the map." : "Swipe up to check rider presence and controls."}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className='px-4'
        style={{ flex: 1, opacity: isExpanded ? 1 : 0 }}
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
          <Text className='text-xs font-semibold' style={{ color: colors.textMuted }}>
            Participants
          </Text>
          <Text className='text-xs' style={{ color: colors.textMuted }}>
            {participants.length} total
          </Text>
        </View>

        {participants.map((participant) => {
          const isFocused = focusedParticipantId === participant.riderId;

          return (
          <Pressable
            key={participant.riderId}
            onPress={() => onParticipantPress?.(participant)}
            className='flex-row items-center justify-between p-3 rounded-xl mb-2'
            style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
          >
            <View className='flex-row items-center'>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: participant.isOnline ? "#22c55e" : colors.textMuted,
                  marginRight: 10,
                }}
              />
              <Text
                style={{
                  color: colors.text,
                  fontWeight: isFocused ? "700" : "400",
                }}
              >
                {participant.displayName}
              </Text>
            </View>
            <Text
              className='text-xs'
              style={{ color: isFocused ? colors.primary : colors.textMuted }}
            >
              {isFocused
                ? "On map"
                : participant.role === "captain"
                  ? "Captain"
                  : participant.role === "co_captain"
                    ? "Co-Captain"
                    : "Rider"}
            </Text>
          </Pressable>
          );
        })}

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
            onPress={onEndRide}
            disabled={ending}
            className='rounded-xl items-center py-3 mt-3'
            style={{
              backgroundColor: colors.danger,
              opacity: ending ? 0.7 : 1,
            }}
          >
            <Text className='font-bold text-white'>
              {ending ? "Ending Ride..." : "End Ride"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}
