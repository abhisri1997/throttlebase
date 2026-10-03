import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from "react-native";
import { Camera } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import {
  CURRENT_RIDER_KEY,
  useCurrentRider,
} from "../../src/services/useCurrentRider";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { useTheme } from "../../src/theme/ThemeContext";
import LocationPicker from "../../src/components/LocationPicker";
import { ModalHeader } from "../../src/components/ModalHeader";
import { pickImage, uploadImage } from "../../src/services/imageUpload";

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
  const currentRider = useCurrentRider().rider;

  const { data: profileObj } = useQuery({
    queryKey: ["rider", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/riders/me");
      return data.rider;
    },
    initialData: () => queryClient.getQueryData(["rider", "me"]) as any,
  });

  const seedRider = profileObj ?? currentRider;

  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<
    "beginner" | "intermediate" | "expert"
  >("beginner");
  const [homeLocationCoords, setHomeLocationCoords] = useState<
    [number, number] | null
  >(null);
  const [homeLocationName, setHomeLocationName] = useState("");
  const [locationDirty, setLocationDirty] = useState(false);
  const [hydratedFromProfile, setHydratedFromProfile] = useState(false);

  useEffect(() => {
    if (!seedRider || hydratedFromProfile) {
      return;
    }

    setDisplayName(seedRider.display_name || "");
    setBio(seedRider.bio || "");
    setProfilePictureUrl(seedRider.profile_picture_url || null);
    setPhoneNumber((seedRider.phone_number || "").replace(/^\+91/, ""));
    setExperienceLevel(seedRider.experience_level || "beginner");
    setHomeLocationCoords(extractHomeCoords(seedRider));
    setHomeLocationName(extractHomeName(seedRider));
    setHydratedFromProfile(true);
  }, [seedRider, hydratedFromProfile]);



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
        profile_picture_url: profilePictureUrl,
        phone_number: phoneNumber.trim() ? `+91${phoneNumber.trim()}` : null,
        experience_level: experienceLevel,
        location_coords: homeLocationCoords,
        ...(locationDirty ? { location_city: homeLocationName, location_region: null } : {}),
      }),
    onSuccess: (data) => {
      // The server's response is the source of truth; invalidating makes the
      // next read fetch it rather than trusting a locally patched copy, which
      // is what used to drift out of date.
      const updatedRider = (data as { rider?: unknown })?.rider ?? null;
      if (updatedRider) {
        setHomeLocationCoords(extractHomeCoords(updatedRider));
        setHomeLocationName(extractHomeName(updatedRider));
      }
      queryClient.invalidateQueries({ queryKey: CURRENT_RIDER_KEY });
      queryClient.invalidateQueries({ queryKey: ["rider"] });
      Alert.alert("Success", "Profile updated successfully!");
      closeModal();
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to update profile"));
    },
  });

  const handleSave = () => {
    if (!displayName.trim())
      return Alert.alert("Validation", "Display name is required");
    if (phoneNumber.trim() && !/^[6-9]\d{9}$/.test(phoneNumber.trim()))
      return Alert.alert("Validation", "Enter a valid 10-digit Indian mobile number");
    mutation.mutate();
  };

  const handlePickImage = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;

      setIsUploadingImage(true);
      const url = await uploadImage(uri);
      setProfilePictureUrl(url);
    } catch (err) {
      Alert.alert("Error", "Failed to upload image. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <SafeAreaView className='flex-1' style={{ backgroundColor: colors.bg }}>
      <ModalHeader
        title="Edit Profile"
        leftAction="cancel"
        onLeftPress={closeModal}
        rightAction={{
          label: "Save",
          onPress: handleSave,
          loading: mutation.isPending || isUploadingImage,
        }}
      />

      <ScrollView className='flex-1 px-4 pt-6' keyboardShouldPersistTaps='handled'>
        {/* Profile Picture */}
        <View className="items-center mb-6">
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={isUploadingImage}
            className="w-24 h-24 rounded-full items-center justify-center relative"
            style={{
              backgroundColor: colors.inputBg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {profilePictureUrl ? (
              <Image source={{ uri: profilePictureUrl }} className="w-full h-full rounded-full" />
            ) : (
              <Camera color={colors.textMuted} size={32} />
            )}
            
            {isUploadingImage && (
              <View className="absolute inset-0 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            <View 
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center shadow-sm"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Camera color={colors.text} size={14} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Core Identity */}
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Display Name
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
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Phone
        </Text>
        <TextInput
          className='p-4 rounded-xl mb-4'
          style={{
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
          }}
          placeholder='10-digit mobile number'
          placeholderTextColor={colors.textMuted}
          keyboardType='phone-pad'
          maxLength={10}
          value={phoneNumber}
          onChangeText={(text) => setPhoneNumber(text.replace(/[^0-9]/g, ''))}
        />
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Bio
        </Text>
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
        <Text
          className='text-sm font-bold uppercase mb-2'
          style={{ color: colors.textMuted }}
        >
          Hometown
        </Text>
        <View className='mb-6'>
          <LocationPicker
            label='Home Location (Used for Auto-Start Rides)'
            initialCoords={homeLocationCoords || undefined}
            initialName={homeLocationName || undefined}
            onSelect={(result) => {
              setHomeLocationCoords(result.coords);
              setHomeLocationName(result.name);
              setLocationDirty(true);
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


      </ScrollView>
    </SafeAreaView>
  );
}
