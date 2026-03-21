import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Link, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { UserPlus } from "lucide-react-native";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { apiClient } from "../../src/api/client";
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme/ThemeContext";

export default function RegisterScreen() {
  const { colors } = useTheme();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    display_name: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((state) => state.login);
  const handleRegister = async () => {
    if (!form.username || !form.email || !form.password) {
      Alert.alert("Error", "Username, email, and password are required.");
      return;
    }
    try {
      setIsLoading(true);
      const res = await apiClient.post("/auth/register", form); // Auto login after successful register
      await login(res.data.token, res.data.rider);
      router.replace("/(tabs)/feed");
    } catch (error: any) {
      const msg = error.response?.data?.error || "Registration failed";
      Alert.alert("Registration Error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className='flex-1' style={{ backgroundColor: colors.bg }}>
      <StatusBar style='light' />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className='flex-1'
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
          <View className='mt-8 mb-8 items-center'>
            <View className='w-16 h-16 rounded-full items-center justify-center border mb-4'>
              <UserPlus size={28} color='#22c55e' />
            </View>
            <Text className='text-3xl font-bold '>Join the Pack</Text>
            <Text className='text-center mt-2 px-6'>
              {" "}
              Create an account to track routes, discover rides, and connect
              with riders.{" "}
            </Text>
          </View>
          <View className='p-6 rounded-3xl border shadow-lg mb-8'>
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
              label='Display Name'
              placeholder='e.g. John Doe (Optional)'
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
              className='mt-6'
            />
            <View className='flex-row justify-center mt-6'>
              <Text className=''>Already a rider? </Text>
              <Link href='/login' asChild>
                <Text className='text-primary-500 font-bold'>Sign In</Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
