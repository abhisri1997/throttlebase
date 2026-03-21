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
import { X, Check, Plus, Trash2, MapPin } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import LocationPicker from "../../src/components/LocationPicker";

const createRide = async (payload: any) => {
  const { data } = await apiClient.post("/api/rides", payload);
  return data;
};

const updateRide = async (id: string, payload: any) => {
  const { data } = await apiClient.patch(`/api/rides/${id}`, payload);
  return data;
};

type StopType = "fuel" | "rest" | "photo";
interface PlannedStop {
  type: StopType;
  location_coords: [number, number];
  name: string;
}

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
  const [duration, setDuration] = useState(
    existingRide?.estimated_duration_min?.toString() || "180",
  );
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
    })) || [],
  );
  const [addingStopType, setAddingStopType] = useState<StopType>("fuel");
  const [showStopPicker, setShowStopPicker] = useState(false);

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
    estimated_duration_min: parseInt(duration) || 180,
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
        err.response?.data?.error ||
          `Failed to ${editMode ? "update" : "create"} ride`,
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

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const stopIcon = (type: StopType) => {
    if (type === "fuel") return "⛽";
    if (type === "rest") return "☕";
    return "📸";
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
        keyboardShouldPersistTaps='handled'
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
        <View
          className='mt-2 mb-6 p-4 rounded-2xl'
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <View className='flex-row items-center justify-between mb-3'>
            <Text className='font-bold' style={{ color: colors.text }}>
              Planned Stops
            </Text>
            <View className='flex-row items-center'>
              {(["fuel", "rest", "photo"] as StopType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setAddingStopType(type)}
                  className='py-1 px-2 rounded-full mr-1'
                  style={{
                    backgroundColor:
                      addingStopType === type
                        ? colors.primary + "30"
                        : "transparent",
                    borderWidth: 1,
                    borderColor:
                      addingStopType === type ? colors.primary : colors.border,
                  }}
                >
                  <Text className='text-xs' style={{ color: colors.text }}>
                    {stopIcon(type)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Add Stop via LocationPicker */}
          <LocationPicker
            label={`Add ${addingStopType} stop`}
            placeholder={`Search for a ${addingStopType} stop...`}
            color='#f59e0b'
            onSelect={(result) => {
              setStops([
                ...stops,
                {
                  type: addingStopType,
                  location_coords: result.coords,
                  name: result.name,
                },
              ]);
            }}
          />

          {/* Stop list */}
          {stops.length > 0 && (
            <View className='mt-2'>
              {stops.map((stop, i) => (
                <View
                  key={i}
                  className='flex-row items-center justify-between py-3 px-3 rounded-xl mb-2'
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View className='flex-row items-center flex-1 mr-2'>
                    <Text className='text-base mr-2'>
                      {stopIcon(stop.type)}
                    </Text>
                    <View className='flex-1'>
                      <Text
                        className='font-bold text-sm capitalize'
                        style={{ color: colors.text }}
                      >
                        {stop.type} Stop
                      </Text>
                      <Text
                        className='text-xs mt-0.5'
                        style={{ color: colors.textMuted }}
                        numberOfLines={1}
                      >
                        {stop.name}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removeStop(i)}>
                    <Trash2 color={colors.textMuted} size={16} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {stops.length === 0 && (
            <Text
              className='text-xs text-center py-2'
              style={{ color: colors.textMuted }}
            >
              No stops added yet. Use the search above to add fuel, rest, or
              photo stops.
            </Text>
          )}
        </View>

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
              Duration (mins)
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
              value={duration}
              onChangeText={setDuration}
            />
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
          <TouchableOpacity
            onPress={handlePublish}
            disabled={mutation.isPending}
            className='flex-1 p-4 rounded-2xl ml-2 items-center'
            style={{ backgroundColor: colors.primary }}
          >
            {mutation.isPending ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text
                className='font-bold text-base'
                style={{ color: "#ffffff" }}
              >
                Publish Ride
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
