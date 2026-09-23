import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
