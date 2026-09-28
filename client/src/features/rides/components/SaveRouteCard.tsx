import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../../theme/ThemeContext";
import { SaveRouteSheet } from "./SaveRouteSheet";

interface SaveRouteCardProps {
  rideId: string;
  rideTitle: string | undefined;
}

/**
 * On a finished ride: publish the road this rider actually rode as a route.
 * Saving the same ride twice just opens the route saved the first time.
 */
export function SaveRouteCard({ rideId, rideTitle }: SaveRouteCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [isSheetOpen, setSheetOpen] = useState(false);

  const openRoute = (routeId: string) => {
    setSheetOpen(false);
    router.push(`/route/${routeId}`);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Save this ride as a route</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Share the road you rode so other riders can find it, bookmark it and plan their own ride on it.
      </Text>
      <TouchableOpacity
        accessibilityRole='button'
        onPress={() => setSheetOpen(true)}
        style={[styles.primary, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.primaryText}>Save as route</Text>
      </TouchableOpacity>

      <Modal
        visible={isSheetOpen}
        transparent
        animationType='slide'
        onRequestClose={() => setSheetOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel='Close'
            onPress={() => setSheetOpen(false)}
          />
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Mounted only while open, so the preview loads when the rider asks for it. */}
            {isSheetOpen ? (
              <SaveRouteSheet
                rideId={rideId}
                rideTitle={rideTitle}
                onClose={() => setSheetOpen(false)}
                onOpenRoute={openRoute}
              />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  primary: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryText: { color: "white", fontSize: 15, fontWeight: "700" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "88%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
});
