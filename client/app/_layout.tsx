import { Redirect, Stack, usePathname, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet as NativeWindStyleSheet } from "nativewind";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";
import { useAuthState, useResolvedSession } from "../src/services/useAuthState";
import { useBackgroundLocationTracker } from "../src/hooks/useBackgroundLocationTracker";
import { installPerformanceBufferGuard } from "../src/dev/performanceBufferGuard";
import { FEATURES, isPathEnabled } from "../src/core/features/features";
import { isLegalPath } from "../src/core/legal/legalPages";
import { ageGate } from "../src/features/consent/core/consent";
import { useConsents } from "../src/features/consent/hooks/useConsents";
import { RideConsentHost } from "../src/features/consent/components/RideConsentHost";
import "../global.css";

// Dev builds only: React's per-render performance entries otherwise pile up
// until Android kills the app for low memory on a long ride.
installPerformanceBufferGuard({
  isDev: __DEV__,
  performance: (globalThis as { performance?: { clearMarks?: () => void; clearMeasures?: () => void } })
    .performance,
  timer: {
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  },
});

function AppInner() {
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const pathname = usePathname();
  const authChecked = useResolvedSession();
  const auth = useAuthState();
  const isAuthenticated = auth.status === "signed-in";
  const needsOnboarding = auth.status === "signed-in" && auth.session.needsOnboarding;
  const consents = useConsents();
  const age = ageGate(consents.data, consents.isError);

  useEffect(() => {
    (NativeWindStyleSheet as any).setFlag?.("darkMode", "class");
  }, []);

  // Global background location tracking for active rides
  useBackgroundLocationTracker();

  if (!authChecked || (isAuthenticated && age === "checking")) {
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
  // The Privacy Policy and Terms open for everyone, onboarding or not: they
  // are linked from sign-in, the stores and throttlebase.in.
  const isLegalRoute = isLegalPath(pathname);

  if (!isAuthenticated && !isAuthRoute && !isSharedPostRoute && !isLegalRoute) {
    return (
      <Redirect
        href={{
          pathname: "/(auth)/sign-in",
          params: pathname ? { redirectTo: pathname } : undefined,
        }}
      />
    );
  }

  // The 18+ question comes before anything else, onboarding included (E6).
  // A rider who said no stays on the under-18 screen, which leads only to
  // deleting the account, the Grievance Officer or signing out.
  if (isAuthenticated && age === "ask" && pathname !== "/age" && !isLegalRoute) {
    return <Redirect href='/(consent)/age' />;
  }
  if (isAuthenticated && age === "under_18" && pathname !== "/under-18" && !isLegalRoute) {
    return <Redirect href='/(consent)/under-18' />;
  }
  if (isAuthenticated && age === "ok" && (pathname === "/age" || pathname === "/under-18")) {
    return <Redirect href={needsOnboarding ? "/(auth)/onboarding" : "/(tabs)/feed"} />;
  }
  const ageAnswered = age === "ok";

  // A signed-in rider who has not picked a username stays in onboarding —
  // otherwise they reach a feed where they cannot be mentioned or followed.
  if (isAuthenticated && ageAnswered && needsOnboarding && pathname !== "/onboarding" && !isLegalRoute) {
    return <Redirect href='/(auth)/onboarding' />;
  }

  if (isAuthenticated && isAuthRoute && !needsOnboarding) {
    return <Redirect href='/(tabs)/feed' />;
  }

  // Screens of features held back from this build, reached by a deep link or
  // a stale notification, land on the feed instead.
  if (isAuthenticated && !isPathEnabled(pathname, FEATURES)) {
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
      <RideConsentHost />
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
