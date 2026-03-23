import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { syncRiderFromResponse, useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme/ThemeContext";
import LocationPicker from "../../src/components/LocationPicker";

const updateProfile = async (payload: any) => {
  const { data } = await apiClient.patch("/api/riders/me", payload);
  return data;
};

const parseCoordsTuple = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
};

const extractHomeCoords = (rider: any): [number, number] | null => {
  if (!rider) {
    return null;
  }

  if (typeof rider.location_coords === "string") {
    try {
      return extractHomeCoords({
        ...rider,
        location_coords: JSON.parse(rider.location_coords),
      });
    } catch {
      return null;
    }
  }

  const fromGeoJson = parseCoordsTuple(rider.location_coords?.coordinates);
  if (fromGeoJson) {
    return fromGeoJson;
  }

  const fromArray = parseCoordsTuple(rider.location_coords);
  if (fromArray) {
    return fromArray;
  }

  return parseCoordsTuple([
    rider.location_coords?.lng,
    rider.location_coords?.lat,
  ]);
};

const extractHomeName = (rider: any): string => {
  if (rider?.home_location_name) {
    return rider.home_location_name;
  }

  const sanitizePart = (value: unknown): string => {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    // Ignore obvious placeholder values from seeds/tests.
    if (trimmed.toLowerCase() === "string") {
      return "";
    }

    return trimmed;
  };

  const parts = [
    sanitizePart(rider?.location_city),
    sanitizePart(rider?.location_region),
  ].filter(Boolean);
  return parts.join(", ");
};

export default function EditProfileModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRider = useAuthStore((state: any) => state.rider);

  const { data: profileObj } = useQuery({
    queryKey: ["rider", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/riders/me");
      return data.rider;
    },
    initialData: () => queryClient.getQueryData(["rider", "me"]) as any,
  });

  const seedRider = profileObj
    ? {
        ...profileObj,
        home_location_name: currentRider?.home_location_name,
      }
    : currentRider;

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<
    "beginner" | "intermediate" | "expert"
  >("beginner");
  const [homeLocationCoords, setHomeLocationCoords] = useState<
    [number, number] | null
  >(null);
  const [homeLocationName, setHomeLocationName] = useState("");
  const [hydratedFromProfile, setHydratedFromProfile] = useState(false);

  useEffect(() => {
    if (!seedRider || hydratedFromProfile) {
      return;
    }

    setDisplayName(seedRider.display_name || "");
    setBio(seedRider.bio || "");
    setExperienceLevel(seedRider.experience_level || "beginner");
    setHomeLocationCoords(extractHomeCoords(seedRider));
    setHomeLocationName(extractHomeName(seedRider));
    setHydratedFromProfile(true);
  }, [seedRider, hydratedFromProfile]);

  // Single vehicle tracking for simplicity in the prototype
  const [bikeMake, setBikeMake] = useState("Royal Enfield");
  const [bikeModel, setBikeModel] = useState("Himalayan 450");
  const [bikeYear, setBikeYear] = useState("2024");

  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/profile");
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        display_name: displayName,
        bio,
        experience_level: experienceLevel,
        location_coords: homeLocationCoords,
        vehicles: [
          {
            make: bikeMake,
            model: bikeModel,
            year: parseInt(bikeYear) || new Date().getFullYear(),
            type: "Adventure/Touring",
          },
        ],
      }),
    onSuccess: async (data) => {
      const updatedRider = await syncRiderFromResponse(data, {
        home_location_name: homeLocationName,
      });
      if (updatedRider) {
        queryClient.setQueryData(["rider", "me"], updatedRider);
        setHomeLocationCoords(extractHomeCoords(updatedRider));
        setHomeLocationName(extractHomeName(updatedRider));
      }
      queryClient.invalidateQueries({ queryKey: ["rider"] });
      Alert.alert("Success", "Profile updated successfully!");
      closeModal();
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        err.response?.data?.error || "Failed to update profile",
      );
    },
  });

  const handleSave = () => {
    if (!displayName.trim())
      return Alert.alert("Validation", "Display name is required");
    mutation.mutate();
  };

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
          <Text
            className='font-bold text-lg'
            style={{ color: colors.textMuted }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
        <Text className='font-bold text-lg' style={{ color: colors.text }}>
          Edit Profile
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text
              className='font-bold text-lg'
              style={{ color: colors.primary }}
            >
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className='flex-1 px-4 pt-6'>
        {/* Core Identity */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Public Identity
        </Text>
        <TextInput
          className='p-4 rounded-xl mb-4'
          style={{
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
          }}
          placeholder='Display Name'
          placeholderTextColor={colors.textMuted}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          className='p-4 rounded-xl mb-6 h-28'
          style={{
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
          }}
          placeholder='Tell other riders about yourself...'
          placeholderTextColor={colors.textMuted}
          multiline
          value={bio}
          onChangeText={setBio}
          textAlignVertical='top'
        />

        <View className='mb-6'>
          <LocationPicker
            label='Home Location (Used for Auto-Start Rides)'
            initialCoords={homeLocationCoords || undefined}
            initialName={homeLocationName || undefined}
            onSelect={(result) => {
              setHomeLocationCoords(result.coords);
              setHomeLocationName(result.name);
            }}
            placeholder='Search city or neighborhood...'
          />
        </View>

        {/* Experience Status */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Experience Rating
        </Text>
        <View
          className='flex-row justify-between p-2 rounded-xl mb-6'
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          {(["beginner", "intermediate", "expert"] as const).map((level) => (
            <TouchableOpacity
              key={level}
              onPress={() => setExperienceLevel(level)}
              className='flex-1 py-3 rounded-lg'
              style={{
                backgroundColor:
                  experienceLevel === level ? colors.primary : "transparent",
              }}
            >
              <Text
                className='text-center font-bold capitalize'
                style={{
                  color:
                    experienceLevel === level ? "#ffffff" : colors.textMuted,
                }}
              >
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Virtual Garage */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Primary Motorcycle
        </Text>
        <View
          className='p-4 rounded-2xl mb-12'
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <View
            className='flex-row pb-3 mb-3'
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <View className='flex-1 mr-2'>
              <Text
                className='text-xs mb-1'
                style={{ color: colors.textMuted }}
              >
                Make
              </Text>
              <TextInput
                className='text-lg font-bold'
                style={{ color: colors.text }}
                value={bikeMake}
                onChangeText={setBikeMake}
              />
            </View>
            <View className='flex-1 ml-2'>
              <Text
                className='text-xs mb-1'
                style={{ color: colors.textMuted }}
              >
                Model
              </Text>
              <TextInput
                className='text-lg font-bold'
                style={{ color: colors.text }}
                value={bikeModel}
                onChangeText={setBikeModel}
              />
            </View>
          </View>
          <View>
            <Text className='text-xs mb-1' style={{ color: colors.textMuted }}>
              Year
            </Text>
            <TextInput
              className='text-lg font-bold'
              style={{ color: colors.text }}
              keyboardType='number-pad'
              value={bikeYear}
              onChangeText={setBikeYear}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
