import { Stack } from "expo-router";

export default function ModalsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name='create-post' />
      <Stack.Screen name='create-ride' />
      <Stack.Screen name='edit-profile' />
      <Stack.Screen name='notifications' />
      <Stack.Screen name='settings' />
      <Stack.Screen name='support' />
    </Stack>
  );
}
