import { Redirect, Stack, usePathname, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { StyleSheet as NativeWindStyleSheet } from "nativewind";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";
import { useAuthStore } from "../src/store/authStore";
import "../global.css";

function AppInner() {
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const pathname = usePathname();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authNotice = useAuthStore((state) => state.authNotice);
  const clearAuthNotice = useAuthStore((state) => state.clearAuthNotice);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    (NativeWindStyleSheet as any).setFlag?.("darkMode", "class");
  }, []);

  useEffect(() => {
    checkAuth().finally(() => setAuthChecked(true));
  }, [checkAuth]);

  useEffect(() => {
    if (!authNotice) {
      return;
    }

    const timeoutId = setTimeout(() => {
      clearAuthNotice();
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [authNotice, clearAuthNotice]);

  if (!authChecked) {
    return (
      <View
        className='flex-1 items-center justify-center'
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </View>
    );
  }

  const topSegment = segments[0];
  const isAuthRoute = topSegment === "(auth)";
  const isSharedPostRoute = topSegment === "post";

  if (!isAuthenticated && !isAuthRoute && !isSharedPostRoute) {
    return (
      <Redirect
        href={{
          pathname: "/(auth)/login",
          params: pathname ? { redirectTo: pathname } : undefined,
        }}
      />
    );
  }

  if (isAuthenticated && isAuthRoute) {
    return <Redirect href='/(tabs)/feed' />;
  }

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      {authNotice ? (
        <SafeAreaView
          className='absolute top-0 left-0 right-0 z-50 px-4 pt-2'
          style={{ pointerEvents: "box-none" }}
          edges={["top"]}
        >
          <View
            className='flex-row items-center rounded-2xl px-4 py-3'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.danger + "55",
            }}
          >
            <View className='flex-1 mr-3'>
              <Text className='font-semibold' style={{ color: colors.text }}>
                {authNotice}
              </Text>
            </View>
            <TouchableOpacity
              onPress={clearAuthNotice}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name='(auth)' options={{ headerShown: false }} />
        <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
        <Stack.Screen name='ride/[id]' options={{ headerShown: false }} />
        <Stack.Screen name='route/[id]' options={{ headerShown: false }} />
        <Stack.Screen name='rider/[id]' options={{ headerShown: false }} />
        <Stack.Screen
          name='(modals)'
          options={{ presentation: "modal", headerShown: false }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
