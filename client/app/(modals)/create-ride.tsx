import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Check, Plus, MapPin } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { apiClient } from "../../src/api/client";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { useTheme } from "../../src/theme/ThemeContext";
import LocationPicker from "../../src/components/LocationPicker";
import { PlannedStops } from "../../src/features/rides/components/PlannedStops";
import type { PlannedStop } from "../../src/features/rides/types/stops";
import { fetchNavigationRoute } from "../../src/features/navigation/services/navigationRouteService";

const createRide = async (payload: any) => {
  const { data } = await apiClient.post("/api/rides", payload);
  return data;
};

const updateRide = async (id: string, payload: any) => {
  const { data } = await apiClient.patch(`/api/rides/${id}`, payload);
  return data;
};


const GEAR_OPTIONS = [
  "helmet",
  "gloves",
  "jacket",
  "boots",
  "knee guards",
  "back protector",
];
const VEHICLE_TYPES = [
  "Any",
  "Sport",
  "Cruiser",
  "Adventure",
  "Touring",
  "Commuter",
];

export default function CreateRideModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();

  const editMode = !!params.editRide;
  const existingRide = editMode ? JSON.parse(params.editRide as string) : null;

  // Core details
  const [title, setTitle] = useState(existingRide?.title || "");
  const [description, setDescription] = useState(
    existingRide?.description || "",
  );
  const [capacity, setCapacity] = useState(
    existingRide?.max_capacity?.toString() || "10",
  );
  const [durationSecs, setDurationSecs] = useState<number | null>(
    existingRide?.estimated_duration_min ? existingRide.estimated_duration_min * 60 : null
  );
  const [isCalculatingDuration, setIsCalculatingDuration] = useState(false);
  const [isPrivate, setIsPrivate] = useState(
    existingRide?.visibility === "private",
  );

  // Date/time
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(6, 0, 0, 0);
  const [scheduledDate, setScheduledDate] = useState(
    existingRide?.scheduled_at ? new Date(existingRide.scheduled_at) : tomorrow,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Locations
  const [startCoords, setStartCoords] = useState<[number, number] | null>(
    existingRide?.start_point_geojson?.coordinates || null,
  );
  const [startName, setStartName] = useState(
    existingRide?.start_point_name || "",
  );
  const [endCoords, setEndCoords] = useState<[number, number] | null>(
    existingRide?.end_point_geojson?.coordinates || null,
  );
  const [endName, setEndName] = useState(existingRide?.end_point_name || "");
  const [autoStart, setAutoStart] = useState(
    existingRide?.start_point_auto || false,
  );

  // Intermediate stops
  const [stops, setStops] = useState<PlannedStop[]>(
    existingRide?.stops?.map((s: any) => ({
      type: s.type,
      location_coords: s.location.coordinates,
      name: s.name || "",
      address: s.address || undefined,
      google_place_id: s.google_place_id || undefined,
    })) || [],
  );

  /**
   * Encoded route polyline from the duration lookup below. The route is already
   * being fetched for the ETA, so the corridor for stop suggestions costs
   * nothing extra — it was previously decoded and discarded.
   */
  const [encodedRoutePolyline, setEncodedRoutePolyline] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    const points: { latitude: number; longitude: number }[] = [];

    if (!autoStart && startCoords) {
      points.push({ latitude: startCoords[1], longitude: startCoords[0] });
    }

    stops.forEach((s) => {
      if (s.location_coords) {
        points.push({ latitude: s.location_coords[1], longitude: s.location_coords[0] });
      }
    });

    if (endCoords) {
      points.push({ latitude: endCoords[1], longitude: endCoords[0] });
    }

    if (points.length < 2) {
      if (!existingRide?.estimated_duration_min) setDurationSecs(null);
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      setIsCalculatingDuration(true);
      try {
        const origin = points[0];
        const destination = points[points.length - 1];
        const waypoints = points.slice(1, -1);

        const route = await fetchNavigationRoute({
          origin,
          destination,
          waypoints,
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        });

        if (!cancelled && route) {
          setDurationSecs(route.totalDurationSeconds);
          setEncodedRoutePolyline(route.encodedPolyline);
        }
      } catch (err) {
        console.error("Failed to calculate duration", err);
      } finally {
        if (!cancelled) setIsCalculatingDuration(false);
      }
    };

    const timerId = setTimeout(() => {
      loadRoute();
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [startCoords, endCoords, stops, autoStart, existingRide?.estimated_duration_min]);

  // Requirements
  const [minExperience, setMinExperience] = useState<string>("beginner");
  const [selectedGear, setSelectedGear] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState("Any");

  const closeModal = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/rides");
  };

  const buildPayload = (status: "draft" | "scheduled") => ({
    title,
    description,
    status,
    visibility: isPrivate ? "private" : "public",
    scheduled_at: scheduledDate.toISOString(),
    estimated_duration_min: durationSecs ? Math.max(1, Math.round(durationSecs / 60)) : undefined,
    max_capacity: parseInt(capacity) || 10,
    start_point_coords: autoStart ? undefined : startCoords,
    start_point_name: autoStart ? undefined : startName,
    start_point_auto: autoStart,
    end_point_coords: endCoords,
    end_point_name: endName,
    requirements: {
      min_experience: minExperience,
      mandatory_gear: selectedGear.length > 0 ? selectedGear : undefined,
      vehicle_type:
        vehicleType !== "Any" ? vehicleType.toLowerCase() : undefined,
    },
    stops:
      stops.length > 0
        ? stops.map((s) => ({
          type: s.type,
          location_coords: s.location_coords,
          name: s.name,
          address: s.address,
          google_place_id: s.google_place_id,
        }))
        : undefined,
  });

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      editMode ? updateRide(existingRide.id, payload) : createRide(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rides"] });
      queryClient.invalidateQueries({ queryKey: ["ride", existingRide?.id] });
      const msg = editMode
        ? "Ride updated successfully!"
        : variables.status === "draft"
          ? "Ride saved as draft!"
          : "Ride published!";
      Alert.alert("Success", msg);
      closeModal();
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        getApiErrorMessage(
          err,
          `Failed to ${editMode ? "update" : "create"} ride`,
        ),
      );
    },
  });

  const handlePublish = () => {
    if (!title.trim())
      return Alert.alert("Validation", "A ride title is required");
    if (!autoStart && !startCoords)
      return Alert.alert(
        "Validation",
        "Please set a start point or enable auto-calculate",
      );
    if (!endCoords)
      return Alert.alert("Validation", "Please set a destination");
    mutation.mutate(
      buildPayload(
        existingRide?.status === "active" ||
          existingRide?.status === "completed"
          ? existingRide.status
          : "scheduled",
      ),
    );
  };

  const handleSaveDraft = () => {
    if (!title.trim())
      return Alert.alert("Validation", "A ride title is required");
    mutation.mutate(buildPayload("draft"));
  };

  const toggleGear = (gear: string) => {
    setSelectedGear((prev) =>
      prev.includes(gear) ? prev.filter((g) => g !== gear) : [...prev, gear],
    );
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <SafeAreaView className='flex-1' style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        className='px-4 pt-4 pb-2 flex-row justify-between items-center'
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TouchableOpacity
          onPress={closeModal}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X color={colors.textMuted} size={24} />
        </TouchableOpacity>
        <Text className='font-bold text-lg' style={{ color: colors.text }}>
          Host a Ride
        </Text>
        {mutation.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <TouchableOpacity onPress={handlePublish}>
            <Check color={colors.primary} size={28} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        className='flex-1 px-4 pt-6'
        keyboardShouldPersistTaps='always'
      >
        {/* ──── RIDE DETAILS ──── */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Ride Details
        </Text>
        <TextInput
          className='text-lg p-4 rounded-xl mb-4'
          style={{
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
          }}
          placeholder='Give your ride a catchy name...'
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          className='p-4 rounded-xl mb-6 h-24'
          style={{
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
          }}
          placeholder='Describe the route, pacing, and stops...'
          placeholderTextColor={colors.textMuted}
          multiline
          value={description}
          onChangeText={setDescription}
          textAlignVertical='top'
        />

        {/* ──── DATE & TIME ──── */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Schedule
        </Text>
        <View className='flex-row mb-6'>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className='flex-1 p-4 rounded-xl mr-2'
            style={{
              backgroundColor: colors.inputBg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text className='text-xs mb-1' style={{ color: colors.textMuted }}>
              Date
            </Text>
            <Text
              className='font-bold text-base'
              style={{ color: colors.text }}
            >
              {formatDate(scheduledDate)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTimePicker(true)}
            className='flex-1 p-4 rounded-xl ml-2'
            style={{
              backgroundColor: colors.inputBg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text className='text-xs mb-1' style={{ color: colors.textMuted }}>
              Time
            </Text>
            <Text
              className='font-bold text-base'
              style={{ color: colors.text }}
            >
              {formatTime(scheduledDate)}
            </Text>
          </TouchableOpacity>
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode='date'
            minimumDate={new Date()}
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) {
                const updated = new Date(scheduledDate);
                updated.setFullYear(
                  date.getFullYear(),
                  date.getMonth(),
                  date.getDate(),
                );
                setScheduledDate(updated);
              }
            }}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode='time'
            onChange={(_, date) => {
              setShowTimePicker(false);
              if (date) {
                const updated = new Date(scheduledDate);
                updated.setHours(date.getHours(), date.getMinutes());
                setScheduledDate(updated);
              }
            }}
          />
        )}

        {/* ──── ROUTE ──── */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Route
        </Text>

        {/* Auto-start toggle */}
        <View
          className='flex-row items-center justify-between p-4 rounded-xl mb-3'
          style={{
            borderWidth: 1,
            borderColor: autoStart ? colors.primary + "50" : colors.border,
            backgroundColor: autoStart ? colors.primary + "10" : "transparent",
          }}
        >
          <View className='flex-1 mr-4'>
            <Text className='font-bold' style={{ color: colors.text }}>
              Auto-Calculate Start
            </Text>
            <Text className='text-xs mt-1' style={{ color: colors.textMuted }}>
              Finds the best meeting point for all riders
            </Text>
          </View>
          <Switch
            value={autoStart}
            onValueChange={setAutoStart}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor='white'
          />
        </View>

        {/* Start Point — only shown when auto is off */}
        {!autoStart && (
          <LocationPicker
            label='Start Point'
            placeholder='Search for start location...'
            color='#22c55e'
            initialCoords={startCoords || undefined}
            initialName={startName || undefined}
            onSelect={(result) => {
              setStartCoords(result.coords);
              setStartName(result.name);
            }}
          />
        )}

        {autoStart && (
          <View
            className='p-4 rounded-xl mb-3'
            style={{
              backgroundColor: colors.primary + "10",
              borderWidth: 1,
              borderColor: colors.primary + "30",
            }}
          >
            <Text className='text-sm' style={{ color: colors.primary }}>
              🧭 Start point will be calculated after riders join — the server
              will find a convenient meetup spot like a gas station or café near
              the geographic center of all riders.
            </Text>
          </View>
        )}

        {/* End Point */}
        <LocationPicker
          label='Destination'
          placeholder='Search for destination...'
          color='#f43f5e'
          initialCoords={endCoords || undefined}
          initialName={endName || undefined}
          onSelect={(result) => {
            setEndCoords(result.coords);
            setEndName(result.name);
          }}
        />

        {/* Intermediate Stops */}
        <PlannedStops
          stops={stops}
          onChange={setStops}
          encodedPolyline={encodedRoutePolyline}
        />

        {/* ──── REQUIREMENTS ──── */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Rider Requirements
        </Text>
        <View
          className='mb-6 p-4 rounded-2xl'
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          {/* Experience Level */}
          <Text
            className='text-xs font-bold mb-2'
            style={{ color: colors.textMuted }}
          >
            Minimum Experience
          </Text>
          <View
            className='flex-row mb-4 p-1 rounded-xl'
            style={{ backgroundColor: colors.inputBg }}
          >
            {["beginner", "intermediate", "expert"].map((level) => (
              <TouchableOpacity
                key={level}
                onPress={() => setMinExperience(level)}
                className='flex-1 py-2 rounded-lg'
                style={{
                  backgroundColor:
                    minExperience === level ? colors.primary : "transparent",
                }}
              >
                <Text
                  className='text-center font-bold capitalize text-sm'
                  style={{
                    color:
                      minExperience === level ? "#ffffff" : colors.textMuted,
                  }}
                >
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Mandatory Gear */}
          <Text
            className='text-xs font-bold mb-2'
            style={{ color: colors.textMuted }}
          >
            Mandatory Gear
          </Text>
          <View className='flex-row flex-wrap mb-4'>
            {GEAR_OPTIONS.map((gear) => (
              <TouchableOpacity
                key={gear}
                onPress={() => toggleGear(gear)}
                className='py-1 px-3 rounded-full mr-2 mb-2'
                style={{
                  backgroundColor: selectedGear.includes(gear)
                    ? colors.primary + "30"
                    : colors.surface,
                  borderWidth: 1,
                  borderColor: selectedGear.includes(gear)
                    ? colors.primary
                    : colors.border,
                }}
              >
                <Text
                  className='text-sm capitalize'
                  style={{
                    color: selectedGear.includes(gear)
                      ? colors.primary
                      : colors.text,
                  }}
                >
                  {selectedGear.includes(gear) ? "✓ " : ""}
                  {gear}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Vehicle Type */}
          <Text
            className='text-xs font-bold mb-2'
            style={{ color: colors.textMuted }}
          >
            Vehicle Type
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {VEHICLE_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => setVehicleType(type)}
                className='py-2 px-4 rounded-full mr-2'
                style={{
                  backgroundColor:
                    vehicleType === type ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor:
                    vehicleType === type ? colors.primary : colors.border,
                }}
              >
                <Text
                  className='text-sm font-bold'
                  style={{
                    color: vehicleType === type ? "#ffffff" : colors.text,
                  }}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ──── LOGISTICS ──── */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Logistics
        </Text>
        <View className='flex-row mb-6'>
          <View className='flex-1 mr-2'>
            <Text
              className='text-xs mb-1 ml-1'
              style={{ color: colors.textMuted }}
            >
              Max Riders
            </Text>
            <TextInput
              keyboardType='number-pad'
              className='p-4 rounded-xl'
              style={{
                backgroundColor: colors.inputBg,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
              }}
              value={capacity}
              onChangeText={setCapacity}
            />
          </View>
          <View className='flex-1 ml-2'>
            <Text
              className='text-xs mb-1 ml-1'
              style={{ color: colors.textMuted }}
            >
              Est. Duration
            </Text>
            <View
              className='p-4 rounded-xl flex-row items-center justify-center'
              style={{
                backgroundColor: colors.inputBg,
                borderWidth: 1,
                borderColor: colors.border,
                height: 52,
              }}
            >
              {isCalculatingDuration ? (
                <ActivityIndicator size='small' color={colors.textMuted} />
              ) : (
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                  {durationSecs ? `${Math.round(durationSecs / 60)} mins` : "TBD"}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ──── SETTINGS ──── */}
        <View
          className='flex-row items-center justify-between p-4 rounded-xl mb-6'
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <View className='flex-1 mr-4'>
            <Text
              className='font-bold text-lg mb-1'
              style={{ color: colors.text }}
            >
              Private Ride
            </Text>
            <Text className='text-xs' style={{ color: colors.textMuted }}>
              If enabled, this ride will not appear on the Discover tab.
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor='white'
          />
        </View>

        {/* ──── ACTION BUTTONS ──── */}
        <View className='flex-row mb-16'>
          {(!editMode || existingRide?.status === "draft") && (
            <TouchableOpacity
              onPress={handleSaveDraft}
              disabled={mutation.isPending}
              className='flex-1 p-4 rounded-2xl mr-2 items-center'
              style={{ borderWidth: 2, borderColor: colors.border }}
            >
              <Text
                className='font-bold text-base'
                style={{ color: colors.text }}
              >
                Save Draft
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handlePublish}
            disabled={mutation.isPending}
            className={`p-4 rounded-2xl items-center flex-1 ${!editMode || existingRide?.status === "draft" ? "ml-2" : ""}`}
            style={{ backgroundColor: colors.primary }}
          >
            {mutation.isPending ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text
                className='font-bold text-base'
                style={{ color: "#ffffff" }}
              >
                {editMode && existingRide?.status !== "draft"
                  ? "Save Changes"
                  : "Publish Ride"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
