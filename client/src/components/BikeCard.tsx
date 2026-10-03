import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, useWindowDimensions, Animated } from "react-native";
import { Calendar, Gauge, Camera, ChevronRight, Plus, MoreVertical } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../theme/ThemeContext";

export default function BikeCard({
  vehicle,
  onAddPhoto,
  isAddHovered,
  onMenuPress
}: {
  vehicle: any;
  onAddPhoto?: () => void;
  isAddHovered?: boolean;
  onMenuPress?: () => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const cardWidth = width * 0.9;

  const ghostOpacity = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    Animated.timing(ghostOpacity, {
      toValue: isAddHovered ? 0.6 : 0.15,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isAddHovered]);

  const handlePressIn = () => {
    Animated.timing(ghostOpacity, {
      toValue: 0.6,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(ghostOpacity, {
      toValue: isAddHovered ? 0.6 : 0.15,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const noVehicleCard =
    (
      <TouchableOpacity
        onPress={() => router.push("/add-vehicle" as any)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="rounded-2xl mb-4 overflow-hidden"
        style={{
          width: cardWidth,
          marginRight: 12,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          height: 180,
        }}
        activeOpacity={0.8}
      >
        <View className="flex-1 p-5 justify-between">
          <View>
            <Text
              className="text-xs font-bold uppercase tracking-widest mb-1"
              style={{ color: colors.textMuted, letterSpacing: 2 }}
            >
              Empty Slot
            </Text>
            <Text
              className="text-xl font-bold"
              style={{ color: colors.text }}
            >
              Start your garage
            </Text>
          </View>

          <View className="flex-row items-center">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: colors.primary }}
            >
              <Plus color="#ffffff" size={20} />
            </View>
            <Text
              className="font-bold"
              style={{ color: colors.primary }}
            >
              Add a Vehicle
            </Text>
          </View>

          {/* Ghost Bike Silhouette */}
          <Animated.View
            className="absolute bottom-0 right-0 items-center justify-center"
            style={{
              width: 130,
              height: 110,
              right: 10,
              bottom: 10,
              opacity: ghostOpacity
            }}
          >
            <Text style={{ fontSize: 64, transform: [{ scaleX: -1 }] }}>🏍️</Text>
          </Animated.View>
        </View>
      </TouchableOpacity>
    );

  if (!vehicle) return noVehicleCard;

  return (
    <View
      className="rounded-2xl overflow-hidden mb-4"
      style={{
        width: cardWidth,
        marginRight: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Top section with bike info and image */}
      <View className="p-5 pb-3">
        <View className="flex-row justify-between relative">
          
          {/* Action Menu (Top Right) */}
          {onMenuPress && (
            <TouchableOpacity
              onPress={onMenuPress}
              className="absolute top-0 right-0 p-1 z-10"
              hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
            >
              <MoreVertical size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Left: text content */}
          <View className="flex-1">
            {/* Brand */}
            <Text
              className="text-xs font-bold uppercase tracking-widest mb-1"
              style={{ color: colors.textMuted, letterSpacing: 2 }}
            >
              {vehicle.make}
            </Text>
            {/* Model */}
            <Text
              className="text-2xl font-bold mb-4"
              style={{ color: colors.text }}
            >
              {vehicle.model}
            </Text>

            {/* Stats row */}
            <View className="flex-row" style={{ gap: 20 }}>
              {/* Year */}
              <View className="items-start">
                <View className="flex-row items-center mb-1" style={{ gap: 4 }}>
                  <Calendar color={colors.textMuted} size={14} />
                  <Text
                    className="text-xs"
                    style={{ color: colors.textMuted }}
                  >
                    Year
                  </Text>
                </View>
                <Text className="font-bold text-sm" style={{ color: colors.text }}>
                  {vehicle.year || "\u2014"}
                </Text>
              </View>

              {/* CC */}
              <View className="items-start">
                <View className="flex-row items-center mb-1" style={{ gap: 4 }}>
                  <Gauge color={colors.textMuted} size={14} />
                  <Text
                    className="text-xs"
                    style={{ color: colors.textMuted }}
                  >
                    CC
                  </Text>
                </View>
                <Text className="font-bold text-sm" style={{ color: colors.text }}>
                  {vehicle.engine_capacity_cc
                    ? `${vehicle.engine_capacity_cc}cc`
                    : "\u2014"}
                </Text>
              </View>
            </View>
          </View>

          {/* Right: bike silhouette */}
          <View
            className="items-center justify-center"
            style={{ width: 130, height: 110 }}
          >
            <Text style={{ fontSize: 64, opacity: 0.6 }}>🏍️</Text>
          </View>
        </View>
      </View>

      {/* Add Photo button */}
      <TouchableOpacity
        className="flex-row items-center px-5 py-3"
        style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        onPress={onAddPhoto}
        activeOpacity={0.7}
      >
        <Camera color={colors.textMuted} size={16} />
        <Text
          className="text-sm ml-2"
          style={{ color: colors.textMuted }}
        >
          Add Photo
        </Text>
        <ChevronRight
          color={colors.textMuted}
          size={16}
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>
    </View>
  );
}