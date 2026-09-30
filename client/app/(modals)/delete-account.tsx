import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useTheme } from "../../src/theme/ThemeContext";
import { authService } from "../../src/services/auth";
import { useCurrentRider } from "../../src/services/useCurrentRider";

const CODE_LENGTH = 6;

type Busy = "sending" | "deleting" | null;

const messageOf = (error: unknown): string =>
  (error as Error)?.message || "Something went wrong. Please try again.";

/**
 * The last step of deleting an account: the code emailed to the rider.
 *
 * Settings has already asked twice. A signed-in phone is not proof enough on
 * its own, so the server only deletes with a code sent to the rider's inbox.
 * The code is sent once when the screen opens; "Send a new code" covers every
 * later request.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const email = useCurrentRider().rider?.email ?? null;

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (): Promise<void> => {
    setBusy("sending");
    setError(null);
    try {
      await authService.requestDeletionCode();
      setSent(true);
      setCode("");
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void sendCode();
  }, []);

  const deleteWithCode = async (): Promise<void> => {
    setBusy("deleting");
    setError(null);
    try {
      await authService.deleteAccount(code.trim());
      router.replace("/(auth)/sign-in");
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(null);
    }
  };

  const sentTo = email ? ` to ${email}` : "";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className="text-xl font-bold ml-2" style={{ color: colors.text }}>
          Delete account
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="px-6" keyboardShouldPersistTaps="handled">
          <Text className="mt-4 mb-5 leading-6" style={{ color: colors.textMuted }}>
            {sent
              ? `We emailed a ${CODE_LENGTH}-digit code${sentTo}. Enter it to delete your account.`
              : `Sending a ${CODE_LENGTH}-digit code${sentTo}…`}
          </Text>

          <Input
            label="Code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoComplete="one-time-code"
            editable={busy === null}
          />

          {error ? (
            <Text
              className="mb-4"
              style={{ color: colors.danger }}
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}

          <Button
            title="Delete my account"
            variant="danger"
            onPress={() => void deleteWithCode()}
            isLoading={busy === "deleting"}
            disabled={busy !== null || code.trim().length < CODE_LENGTH}
          />
          <TouchableOpacity
            onPress={() => void sendCode()}
            disabled={busy !== null}
            className="py-4 items-center"
            accessibilityRole="button"
          >
            <Text style={{ color: colors.primary }}>
              {busy === "sending" ? "Sending…" : "Send a new code"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
