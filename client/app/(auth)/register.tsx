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
import { UserPlus } from "lucide-react-native";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { apiClient } from "../../src/api/client";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme/ThemeContext";

export default function RegisterScreen() {
  const { colors, isDark } = useTheme();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    display_name: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const resolvePostRegisterRoute = () => {
    if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
      return redirectTo;
    }

    return "/(tabs)/feed";
  };

  const loginHref =
    typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? ({ pathname: "/login", params: { redirectTo } } as const)
      : "/login";

  const handleRegister = async () => {
    if (!form.username || !form.email || !form.password) {
      Alert.alert("Error", "Username, email, and password are required.");
      return;
    }

    if (!form.display_name.trim()) {
      Alert.alert("Error", "Display name is required.");
      return;
    }

    if (form.password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters.");
      return;
    }

    try {
      setIsLoading(true);
      await apiClient.post("/auth/register", form);

      // Register returns rider only. Fetch JWT via login endpoint before storing auth state.
      const loginRes = await apiClient.post("/auth/login", {
        email: form.email,
        password: form.password,
      });

      await login(loginRes.data.token, loginRes.data.rider);
      router.replace(resolvePostRegisterRoute() as any);
    } catch (error: any) {
      const msg = getApiErrorMessage(error, "Registration failed");
      Alert.alert("Registration Error", msg);
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
          <View className='items-center mt-12 mb-12'>
            <View
              className='w-20 h-20 rounded-3xl items-center justify-center shadow-lg mb-6'
              style={{ backgroundColor: colors.primary }}
            >
              <UserPlus size={40} color='#ffffff' />
            </View>
            <Text
              className='text-4xl font-extrabold tracking-tight'
              style={{ color: colors.text }}
            >
              Join the Pack
            </Text>
            <Text
              className='text-center mt-2 px-6 text-base'
              style={{ color: colors.textMuted }}
            >
              Create an account to track routes, discover rides, and connect
              with riders.
            </Text>
          </View>

          <View
            className='p-6 rounded-3xl mx-4 shadow-2xl mb-8'
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
              Create Account
            </Text>
            <Input
              label='Username*'
              placeholder='e.g. roadwarrior'
              autoCapitalize='none'
              value={form.username}
              onChangeText={(t) => setForm({ ...form, username: t })}
            />
            <Input
              label='Email Address*'
              placeholder='rider@example.com'
              autoCapitalize='none'
              keyboardType='email-address'
              value={form.email}
              onChangeText={(t) => setForm({ ...form, email: t })}
            />
            <Input
              label='Display Name*'
              placeholder='e.g. John Doe'
              value={form.display_name}
              onChangeText={(t) => setForm({ ...form, display_name: t })}
            />
            <Input
              label='Password*'
              placeholder='••••••••'
              secureTextEntry
              value={form.password}
              onChangeText={(t) => setForm({ ...form, password: t })}
            />
            <Button
              title='Create Account'
              onPress={handleRegister}
              isLoading={isLoading}
              className='mt-4'
            />
            <View className='flex-row justify-center mt-6'>
              <Text style={{ color: colors.textMuted }}>Already a rider? </Text>
              <Link href={loginHref as any} asChild>
                <Text className='font-bold' style={{ color: colors.primary }}>
                  Sign In
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
