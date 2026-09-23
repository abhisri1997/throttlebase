import { Redirect, Stack, usePathname, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet as NativeWindStyleSheet } from "nativewind";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";
import { useAuthState, useResolvedSession } from "../src/services/useAuthState";
import { useBackgroundLocationTracker } from "../src/hooks/useBackgroundLocationTracker";
import "../global.css";

function AppInner() {
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const pathname = usePathname();
  const authChecked = useResolvedSession();
  const auth = useAuthState();
  const isAuthenticated = auth.status === "signed-in";
  const needsOnboarding = auth.status === "signed-in" && auth.session.needsOnboarding;

  useEffect(() => {
    (NativeWindStyleSheet as any).setFlag?.("darkMode", "class");
  }, []);

  // Global background location tracking for active rides
  useBackgroundLocationTracker();

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
          pathname: "/(auth)/sign-in",
          params: pathname ? { redirectTo: pathname } : undefined,
        }}
      />
    );
  }

  // A signed-in rider who has not picked a username stays in onboarding —
  // otherwise they reach a feed where they cannot be mentioned or followed.
  if (isAuthenticated && needsOnboarding && pathname !== "/onboarding") {
    return <Redirect href='/(auth)/onboarding' />;
  }

  if (isAuthenticated && isAuthRoute && !needsOnboarding) {
    return <Redirect href='/(tabs)/feed' />;
  }

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name='(auth)' options={{ headerShown: false }} />
        <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
        <Stack.Screen name='ride/[id]' options={{ headerShown: false }} />
        <Stack.Screen
          name='ride/[id]/navigation'
          options={{ headerShown: false }}
        />
        <Stack.Screen name='route/[id]' options={{ headerShown: false }} />
        <Stack.Screen name='rider/[id]' options={{ headerShown: false }} />
        <Stack.Screen name='group/[id]' options={{ headerShown: false }} />
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
