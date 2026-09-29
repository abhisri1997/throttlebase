import React, { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Navigation, Phone, Siren } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { useLiveSessionStore } from "../../../store/liveSessionStore";
import {
  alertAgeLabel,
  alertPosition,
  alertToShow,
  directionsUrl,
  EMERGENCY_DIAL_URL,
} from "../core/groupAlert";

/** Only minutes are shown, so the age need not tick every second. */
const AGE_TICK_MS = 30_000;

interface GroupAlertBannerProps {
  currentRiderId: string | null | undefined;
  /** Rider id to display name, for saying who raised the alert. */
  riderNames: Readonly<Record<string, string>>;
}

/**
 * Put in front of everyone else on the ride when a rider raises a group
 * alert: who, how long ago, and a way to ride to them. Dismissing hides this
 * alert on this phone only.
 */
export function GroupAlertBanner({ currentRiderId, riderNames }: GroupAlertBannerProps) {
  const { colors } = useTheme();
  const incidents = useLiveSessionStore((state) => state.incidents);
  const locations = useLiveSessionStore((state) => state.locations);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), AGE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const incident = useMemo(
    // Read the clock afresh: a new alert must not be judged against a stale tick.
    () => alertToShow(incidents, currentRiderId, dismissed, Math.max(nowMs, Date.now())),
    [currentRiderId, dismissed, incidents, nowMs],
  );
  if (!incident) return null;

  const live = locations[incident.riderId];
  const position = alertPosition(incident, live ? { lat: live.lat, lon: live.lon } : null);
  const name = riderNames[incident.riderId] ?? "A rider";

  return (
    <View
      accessibilityRole='alert'
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}
    >
      <View style={styles.header}>
        <Siren color={colors.danger} size={22} />
        <Text style={[styles.title, { color: colors.text }]}>{name} sent a group alert</Text>
      </View>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {alertAgeLabel(incident.createdAt, nowMs)}
        {position ? "" : " · their location isn't available yet"}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole='button'
          disabled={!position}
          onPress={() => position && void Linking.openURL(directionsUrl(position))}
          style={[styles.action, { backgroundColor: colors.danger, opacity: position ? 1 : 0.5 }]}
        >
          <Navigation color='white' size={18} />
          <Text style={styles.actionText}>Navigate to {name.split(" ")[0]}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel='Call 112, emergency'
          onPress={() => void Linking.openURL(EMERGENCY_DIAL_URL)}
          style={[styles.action, styles.outline, { borderColor: colors.danger }]}
        >
          <Phone color={colors.danger} size={18} />
          <Text style={[styles.actionText, { color: colors.danger }]}>Call 112</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        accessibilityRole='button'
        onPress={() => setDismissed((previous) => new Set(previous).add(incident.incidentId))}
        style={styles.dismiss}
      >
        <Text style={[styles.dismissText, { color: colors.text }]}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "22%",
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    zIndex: 90,
    elevation: 90,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 8,
    flexShrink: 1,
  },
  body: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  action: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  outline: {
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  actionText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 6,
  },
  dismiss: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
