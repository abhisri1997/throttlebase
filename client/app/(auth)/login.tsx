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
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme/ThemeContext";

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }
    try {
      setIsLoading(true);
      const res = await apiClient.post("/auth/login", { email, password });
      await login(res.data.token, res.data.rider);
      router.replace(resolvePostLoginRoute() as any);
    } catch (error: any) {
      const msg = error.response?.data?.error || "Failed to connect to server";
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
              label='Email Address'
              placeholder='rider@example.com'
              autoCapitalize='none'
              keyboardType='email-address'
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label='Password'
              placeholder='••••••••'
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
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
