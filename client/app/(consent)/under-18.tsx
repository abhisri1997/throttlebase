import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/theme/ThemeContext";
import { authService } from "../../src/services/auth";

/**
 * Where a rider who said they are under 18 lands, every time. Only support
 * can change the answer (the server refuses a "yes" from the app after a
 * "no"). They can delete their account or sign out.
 */
export default function UnderEighteenScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: colors.text }]}>ThrottleBase is for riders 18 and over</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          You told us you're under 18, so you can't use ThrottleBase. You can delete your account and everything in
          it now. If you answered by mistake, contact us and we'll check and correct it.
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole='button'
          onPress={() => router.push("/delete-account")}
          style={[styles.primary, { backgroundColor: colors.danger }]}
        >
          <Text style={styles.primaryText}>Delete my account</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole='link' onPress={() => router.push("/grievance")} style={styles.secondary}>
          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>I answered by mistake</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole='button' onPress={() => void authService.signOut()} style={styles.secondary}>
          <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 15 }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "space-between" },
  content: { padding: 24, paddingTop: 64, gap: 12 },
  heading: { fontSize: 26, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 23 },
  actions: { padding: 24, gap: 4 },
  primary: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { alignItems: "center", paddingVertical: 14 },
});
