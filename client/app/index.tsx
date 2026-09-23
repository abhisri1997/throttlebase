import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../src/theme/ThemeContext";
import { useAuthState, useResolvedSession } from "../src/services/useAuthState";

export default function Index() {
  const { colors } = useTheme();
  const resolved = useResolvedSession();
  const auth = useAuthState();

  if (!resolved) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (auth.status !== "signed-in") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // A rider without a username has not finished setting up, whichever
  // provider they arrived through.
  if (auth.session.needsOnboarding) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return <Redirect href="/(tabs)/feed" />;
}
