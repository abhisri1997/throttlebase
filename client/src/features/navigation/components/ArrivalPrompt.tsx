import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { formatDuration } from "../core/format";
import { autoFinishRemainingMs } from "../../rides/core/riderProgress";

/** The countdown only shows minutes, so it need not tick every second. */
const COUNTDOWN_TICK_MS = 15_000;

interface ArrivalPromptProps {
  destinationName: string;
  /** When the rider reached the destination; the auto-finish counts from here. */
  arrivedAtMs: number;
  autoFinishAfterMs: number;
  onFinish: () => void;
  onDismiss: () => void;
  isFinishing: boolean;
}

/**
 * "You've arrived — finish your ride?" The ride finishes itself after the
 * countdown if the rider stays; dismissing only hides this card, and the
 * Finish my ride button in the crew sheet stays available.
 */
export function ArrivalPrompt({
  destinationName,
  arrivedAtMs,
  autoFinishAfterMs,
  onFinish,
  onDismiss,
  isFinishing,
}: ArrivalPromptProps) {
  const { colors } = useTheme();
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = autoFinishRemainingMs(arrivedAtMs, autoFinishAfterMs, nowMs);
  const countdown =
    remainingMs > 0
      ? `We'll finish it for you in ${formatDuration(remainingMs / 1000)} if you stay here.`
      : "Finishing your ride…";

  return (
    <View
      accessibilityLiveRegion='polite'
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>You've arrived</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        You're at {destinationName}. Finish your ride? {countdown}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole='button'
          onPress={onDismiss}
          style={[styles.secondary, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>Not yet</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole='button'
          onPress={onFinish}
          disabled={isFinishing}
          style={[styles.primary, { backgroundColor: colors.primary, opacity: isFinishing ? 0.7 : 1 }]}
        >
          <Text style={styles.primaryText}>{isFinishing ? "Finishing…" : "Finish my ride"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "28%",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 80,
    elevation: 80,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  body: {
    fontSize: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
