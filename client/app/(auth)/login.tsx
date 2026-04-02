import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MapPin } from "lucide-react-native";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { apiClient } from "../../src/api/client";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme/ThemeContext";

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const resolvePostLoginRoute = () => {
    if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
      return redirectTo;
    }

    return "/(tabs)/feed";
  };

  const registerHref =
    typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? ({ pathname: "/register", params: { redirectTo } } as const)
      : "/register";

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert("Error", "Please enter email/username and password");
      return;
    }
    try {
      setIsLoading(true);
      const res = await apiClient.post("/auth/login", {
        identifier: identifier.trim(),
        password,
        ...(requiresTotp ? { totp_token: totpToken.trim() } : {}),
      });
      await login(res.data.token, res.data.rider);
      router.replace(resolvePostLoginRoute() as any);
    } catch (error: any) {
      if (error?.response?.data?.code === "TWO_FACTOR_REQUIRED") {
        setRequiresTotp(true);
        Alert.alert("Two-Factor Required", "Enter your 6-digit authenticator code to continue.");
        return;
      }
      const msg = getApiErrorMessage(error, "Failed to connect to server");
      Alert.alert("Login Failed", msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className='flex-1' style={{ backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className='flex-1'
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View className='items-center mt-12 mb-16'>
            <View
              className='w-20 h-20 rounded-3xl items-center justify-center shadow-lg mb-6'
              style={{ backgroundColor: colors.primary }}
            >
              <MapPin size={40} color='white' />
            </View>
            <Text
              className='text-4xl font-extrabold tracking-tight'
              style={{ color: colors.text }}
            >
              ThrottleBase
            </Text>
            <Text
              className='text-base mt-2'
              style={{ color: colors.textMuted }}
            >
              Ride together. Explore forever.
            </Text>
          </View>

          <View
            className='p-6 rounded-3xl mx-4 shadow-2xl'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              className='text-2xl font-bold mb-6'
              style={{ color: colors.text }}
            >
              Welcome Back
            </Text>
            <Input
              label='Email or Username'
              placeholder='rider@example.com or roadwarrior'
              autoCapitalize='none'
              value={identifier}
              onChangeText={setIdentifier}
            />
            <Input
              label='Password'
              placeholder='••••••••'
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {requiresTotp ? (
              <Input
                label='Authenticator Code'
                placeholder='123456'
                keyboardType='number-pad'
                value={totpToken}
                onChangeText={setTotpToken}
              />
            ) : null}
            <Button
              title='Sign In'
              onPress={handleLogin}
              isLoading={isLoading}
              className='mt-4'
            />
            <View className='flex-row justify-center mt-6'>
              <Text style={{ color: colors.textMuted }}>
                Don't have an account?{" "}
              </Text>
              <Link href={registerHref as any} asChild>
                <Text className='font-bold' style={{ color: colors.primary }}>
                  Sign Up
                </Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 40 },
});
