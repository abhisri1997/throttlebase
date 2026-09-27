import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../theme/ThemeContext";
import { saveRideAsRoute, type RouteVisibility } from "../api/rideRoute";
import {
  MAX_ROUTE_TITLE_LENGTH,
  defaultRouteTitle,
  saveRouteErrorMessage,
  validRouteTitle,
} from "../core/saveRoute";

interface SaveRouteCardProps {
  rideId: string;
  rideTitle: string | undefined;
}

const VISIBILITY_OPTIONS: { value: RouteVisibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find it in Routes and ride it." },
  { value: "private", label: "Only me", hint: "Kept in your routes; nobody else sees it." },
];

/**
 * On a finished ride: publish the road this rider actually rode as a route.
 * Saving the same ride twice just opens the route saved the first time.
 */
export function SaveRouteCard({ rideId, rideTitle }: SaveRouteCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [title, setTitle] = useState(() => defaultRouteTitle(rideTitle));
  const [visibility, setVisibility] = useState<RouteVisibility>("public");

  const save = useMutation({
    mutationFn: (validTitle: string) => saveRideAsRoute(rideId, { title: validTitle, visibility }),
    onSuccess: ({ route }) => {
      void queryClient.invalidateQueries({ queryKey: ["routes"] });
      setSheetOpen(false);
      router.push(`/route/${route.id}`);
    },
  });

  const validTitle = validRouteTitle(title);
  const canSave = validTitle !== null && !save.isPending;

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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Save as route</Text>

            <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={MAX_ROUTE_TITLE_LENGTH}
              accessibilityLabel='Route name'
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Who can see it</Text>
            {VISIBILITY_OPTIONS.map((option) => {
              const isSelected = option.value === visibility;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole='radio'
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setVisibility(option.value)}
                  style={[
                    styles.option,
                    { borderColor: isSelected ? colors.primary : colors.border },
                  ]}
                >
                  <Text style={[styles.optionLabel, { color: colors.text }]}>{option.label}</Text>
                  <Text style={[styles.optionHint, { color: colors.textMuted }]}>{option.hint}</Text>
                </TouchableOpacity>
              );
            })}

            {save.isError ? (
              <Text accessibilityLiveRegion='polite' style={[styles.error, { color: colors.danger }]}>
                {saveRouteErrorMessage(save.error)}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole='button'
                onPress={() => setSheetOpen(false)}
                style={[styles.secondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole='button'
                accessibilityState={{ disabled: !canSave }}
                disabled={!canSave}
                onPress={() => validTitle && save.mutate(validTitle)}
                style={[styles.primary, styles.flex, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.6 }]}
              >
                <Text style={styles.primaryText}>{save.isPending ? "Saving…" : "Save route"}</Text>
              </TouchableOpacity>
            </View>
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
  secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { fontSize: 15, fontWeight: "600" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  option: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  optionLabel: { fontSize: 15, fontWeight: "600" },
  optionHint: { fontSize: 12, marginTop: 2 },
  error: { fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  flex: { flex: 1 },
});
