import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Mail, MapPin } from "lucide-react-native";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useTheme } from "../../src/theme/ThemeContext";
import { authService } from "../../src/services/auth";
import { isAppleSignInSupported } from "../../src/services/platformCapabilities";

type Stage = "choose" | "email" | "code";

const TERMS_URL = "https://throttlebase.in/terms";
const PRIVACY_URL = "https://throttlebase.in/privacy";

/**
 * One screen for signing in and signing up.
 *
 * There is no separate registration flow: whether an account already exists
 * is the server's business, and asking riders to pick the right button is a
 * question they cannot reliably answer about themselves.
 */
export default function SignInScreen() {
  const { colors, isDark } = useTheme();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();

  const [stage, setStage] = useState<Stage>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isAppleSignInSupported().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goAfterSignIn = (needsOnboarding: boolean): void => {
    if (needsOnboarding) {
      router.replace("/(auth)/onboarding");
      return;
    }

    const target =
      typeof redirectTo === "string" && redirectTo.startsWith("/")
        ? redirectTo
        : "/(tabs)/feed";
    router.replace(target as never);
  };

  const run = async (label: string, action: () => Promise<void>): Promise<void> => {
    try {
      setBusy(label);
      await action();
    } catch (error) {
      // A cancelled sign-in is a choice, not a failure: showing an error for
      // it would be nagging.
      const name = (error as { name?: string })?.name;
      if (name !== "SignInCancelledError") {
        Alert.alert(
          "Couldn't sign in",
          (error as Error)?.message ?? "Please try again.",
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const continueWithGoogle = () =>
    run("google", async () => {
      const session = await authService.signInWithGoogle();
      goAfterSignIn(session.needsOnboarding);
    });

  const continueWithApple = () =>
    run("apple", async () => {
      const session = await authService.signInWithApple();
      goAfterSignIn(session.needsOnboarding);
    });

  const sendCode = () =>
    run("email", async () => {
      await authService.sendEmailCode(email.trim());
      setStage("code");
    });

  const verifyCode = () =>
    run("verify", async () => {
      const session = await authService.verifyEmailCode(email.trim(), code.trim());
      goAfterSignIn(session.needsOnboarding);
    });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          className="px-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-10">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: colors.primary + "22" }}
            >
              <MapPin color={colors.primary} size={30} />
            </View>
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>
              ThrottleBase
            </Text>
            <Text className="text-sm mt-1" style={{ color: colors.textMuted }}>
              Ride together. Arrive together.
            </Text>
          </View>

          {stage === "choose" ? (
            <View>
              <Button
                title="Continue with Google"
                onPress={continueWithGoogle}
                isLoading={busy === "google"}
                disabled={busy !== null}
                className="mb-3"
              />

              {appleAvailable ? (
                <Button
                  title="Continue with Apple"
                  variant="secondary"
                  onPress={continueWithApple}
                  isLoading={busy === "apple"}
                  disabled={busy !== null}
                  className="mb-3"
                />
              ) : null}

              <TouchableOpacity
                onPress={() => setStage("email")}
                disabled={busy !== null}
                className="flex-row items-center justify-center py-3.5"
              >
                <Mail color={colors.primary} size={18} />
                <Text
                  className="ml-2 font-semibold"
                  style={{ color: colors.primary }}
                >
                  Continue with email
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {stage === "email" ? (
            <View>
              <Input
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={busy === null}
              />
              <Button
                title="Send me a code"
                onPress={sendCode}
                isLoading={busy === "email"}
                disabled={busy !== null || email.trim().length < 3}
              />
              <TouchableOpacity
                onPress={() => setStage("choose")}
                className="py-4 items-center"
              >
                <Text style={{ color: colors.textMuted }}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {stage === "code" ? (
            <View>
              <Text
                className="text-center mb-5"
                style={{ color: colors.textMuted }}
              >
                We sent a 6-digit code to{"\n"}
                <Text style={{ color: colors.text }}>{email.trim()}</Text>
              </Text>
              <Input
                label="Code"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                editable={busy === null}
              />
              <Button
                title="Sign in"
                onPress={verifyCode}
                isLoading={busy === "verify"}
                disabled={busy !== null || code.trim().length < 6}
              />
              <TouchableOpacity
                onPress={sendCode}
                disabled={busy !== null}
                className="py-4 items-center"
              >
                <Text style={{ color: colors.primary }}>Send a new code</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text
            className="text-xs text-center mt-8 leading-5"
            style={{ color: colors.textMuted }}
          >
            By continuing you agree to the{" "}
            <Text
              style={{ color: colors.primary }}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              Terms
            </Text>{" "}
            and{" "}
            <Text
              style={{ color: colors.primary }}
              onPress={() => void Linking.openURL(PRIVACY_URL)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
