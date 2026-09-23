import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useTheme } from "../../src/theme/ThemeContext";
import { authService } from "../../src/services/auth";

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
] as const;

const USERNAME_DEBOUNCE_MS = 400;

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable"; reason: string };

const REASON_TEXT: Record<string, string> = {
  invalid_format: "3–20 characters, lowercase letters, numbers or underscores.",
  reserved: "That username is reserved.",
  taken: "That username is taken.",
};

/**
 * Shown once, after a first sign-in, while needsOnboarding is true.
 *
 * A username is the only genuinely required field — everything else can be
 * filled in later from the profile screen, and a long form here is the
 * fastest way to lose a rider who has just arrived.
 */
export default function OnboardingScreen() {
  const { colors } = useTheme();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [experienceLevel, setExperienceLevel] =
    useState<(typeof EXPERIENCE_LEVELS)[number]["value"]>("beginner");
  const [city, setCity] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [saving, setSaving] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async (candidate: string) => {
    if (candidate.trim().length < 3) {
      setAvailability({ state: "idle" });
      return;
    }

    setAvailability({ state: "checking" });
    try {
      const result = await authService.checkUsername(candidate.trim());
      setAvailability(
        result.available
          ? { state: "available" }
          : { state: "unavailable", reason: result.reason },
      );
    } catch {
      // A failed check must not block the form; the server validates again
      // on submit.
      setAvailability({ state: "idle" });
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void check(username), USERNAME_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [username, check]);

  const submit = async (): Promise<void> => {
    try {
      setSaving(true);
      await authService.completeOnboarding({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim() || username.trim(),
        experienceLevel,
        locationCity: city.trim() || null,
        firstVehicle:
          make.trim() && model.trim()
            ? {
                make: make.trim(),
                model: model.trim(),
                year: null,
                engineCapacityCc: null,
              }
            : null,
      });
      router.replace("/(tabs)/feed");
    } catch (error) {
      Alert.alert(
        "Couldn't save",
        (error as Error)?.message ?? "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    availability.state === "available" && !saving && displayName.trim().length > 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="px-6" keyboardShouldPersistTaps="handled">
          <View className="py-8">
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>
              Set up your profile
            </Text>
            <Text className="mt-1" style={{ color: colors.textMuted }}>
              Just a username to get going. The rest can wait.
            </Text>
          </View>

          <Input
            label="Username"
            value={username}
            onChangeText={(text) => setUsername(text.toLowerCase())}
            placeholder="ada_rider"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />

          <View className="flex-row items-center -mt-2 mb-4 ml-1">
            {availability.state === "checking" ? (
              <Text className="text-xs" style={{ color: colors.textMuted }}>
                Checking…
              </Text>
            ) : null}
            {availability.state === "available" ? (
              <>
                <Check color="#22c55e" size={14} />
                <Text className="text-xs ml-1" style={{ color: "#22c55e" }}>
                  Available
                </Text>
              </>
            ) : null}
            {availability.state === "unavailable" ? (
              <>
                <X color={colors.danger} size={14} />
                <Text className="text-xs ml-1" style={{ color: colors.danger }}>
                  {REASON_TEXT[availability.reason] ?? "Not available."}
                </Text>
              </>
            ) : null}
          </View>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Ada Rider"
            maxLength={100}
          />

          <Text
            className="text-sm font-medium mb-2 ml-1"
            style={{ color: colors.text }}
          >
            Experience
          </Text>
          <View className="flex-row flex-wrap mb-4">
            {EXPERIENCE_LEVELS.map((level) => {
              const selected = experienceLevel === level.value;
              return (
                <TouchableOpacity
                  key={level.value}
                  onPress={() => setExperienceLevel(level.value)}
                  className="px-4 py-2 rounded-full mr-2 mb-2"
                  style={{
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: selected ? "#ffffff" : colors.text }}>
                    {level.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input
            label="City (optional)"
            value={city}
            onChangeText={setCity}
            placeholder="Bengaluru"
            maxLength={100}
          />

          <Text
            className="text-sm font-medium mb-2 ml-1"
            style={{ color: colors.text }}
          >
            Your bike (optional)
          </Text>
          <Input
            label="Make"
            value={make}
            onChangeText={setMake}
            placeholder="Royal Enfield"
            maxLength={100}
          />
          <Input
            label="Model"
            value={model}
            onChangeText={setModel}
            placeholder="Himalayan"
            maxLength={100}
          />

          <Button
            title="Start riding"
            onPress={submit}
            isLoading={saving}
            disabled={!canSubmit}
            className="mt-2 mb-10"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
