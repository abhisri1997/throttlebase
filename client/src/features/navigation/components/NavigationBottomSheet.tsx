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
import { useTheme } from "../../../theme/ThemeContext";
import type { RideParticipantView } from "../types/navigation";

type Props = {
  rideName: string;
  participants: RideParticipantView[];
  isHost: boolean;
  canEndRide: boolean;
  onEndRide: () => void;
  ending: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function NavigationBottomSheet({
  rideName,
  participants,
  isHost,
  canEndRide,
  onEndRide,
  ending,
}: Props) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [chromeHeight, setChromeHeight] = useState(118);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);

  const collapsedHeight = 170;
  const expandedHeight = clamp(
    chromeHeight + scrollContentHeight,
    collapsedHeight,
    Math.round(windowHeight * 0.82),
  );
  const snapThreshold = (collapsedHeight + expandedHeight) / 2;

  const heightValue = useRef(new Animated.Value(collapsedHeight)).current;
  const dragStartHeight = useRef(collapsedHeight);

  const snapToHeight = (targetHeight: number) => {
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
    heightValue.stopAnimation((value: number) => {
      if (value > expandedHeight) {
        heightValue.setValue(expandedHeight);
      }
    });
  }, [expandedHeight, heightValue]);

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
          className='items-center pt-3 pb-2'
        >
          <View
            style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: colors.textMuted }}
          />
        </Pressable>

        <View className='px-4 pb-4'>
          <Text className='text-lg font-bold' style={{ color: colors.text }} numberOfLines={1}>
            {rideName}
          </Text>
        </View>
      </View>

      <ScrollView
        className='px-4'
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        onContentSizeChange={(_, contentHeight) => {
          const nextHeight = Math.round(contentHeight);
          setScrollContentHeight((previous) =>
            Math.abs(previous - nextHeight) > 2 ? nextHeight : previous,
          );
        }}
      >
        <Text className='text-xs font-semibold mb-2' style={{ color: colors.textMuted }}>
          Participants
        </Text>

        {participants.map((participant) => (
          <View
            key={participant.riderId}
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
              <Text style={{ color: colors.text }}>{participant.displayName}</Text>
            </View>
            <Text className='text-xs' style={{ color: colors.textMuted }}>
              {participant.role === "captain"
                ? "Captain"
                : participant.role === "co_captain"
                  ? "Co-Captain"
                  : "Rider"}
            </Text>
          </View>
        ))}

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
