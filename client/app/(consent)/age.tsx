import React from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { useDeclareAge } from "../../src/features/consent/hooks/useConsents";

/**
 * The 18+ question (launch readiness E6). Asked once, before anything else,
 * of new riders and of riders who signed up before it existed. The root
 * layout moves on as soon as the answer is recorded.
 */
export default function AgeScreen() {
  const { colors } = useTheme();
  const declare = useDeclareAge();

  const answer = (isAdult: boolean): void => {
    declare.mutate(
      { isAdult, source: "onboarding" },
      {
        onError: (error) =>
          Alert.alert("Couldn't save your answer", getApiErrorMessage(error, "Check your connection and try again.")),
      },
    );
  };

  const sayUnder18 = (): void => {
    Alert.alert(
      "You're under 18?",
      "ThrottleBase is only for riders aged 18 or older, so you won't be able to use the app. This can't be undone from the app.",
      [
        { text: "Go back", style: "cancel" },
        { text: "I'm under 18", style: "destructive", onPress: () => answer(false) },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: colors.text }]}>Are you 18 or older?</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          ThrottleBase is for riders aged 18 and over. We ask once and keep your answer as part of your account.
        </Text>
      </View>
      {declare.isPending ? (
        <ActivityIndicator color={colors.primary} style={styles.spinner} />
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole='button'
            onPress={() => answer(true)}
            style={[styles.primary, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.primaryText}>Yes, I'm 18 or older</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole='button' onPress={sayUnder18} style={styles.secondary}>
            <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 15 }}>No, I'm under 18</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "space-between" },
  content: { padding: 24, paddingTop: 64, gap: 12 },
  heading: { fontSize: 28, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 23 },
  spinner: { marginBottom: 48 },
  actions: { padding: 24, gap: 8 },
  primary: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { alignItems: "center", paddingVertical: 14 },
});
