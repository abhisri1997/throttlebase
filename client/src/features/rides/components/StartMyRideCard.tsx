import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { LiveSessionParticipant } from "../../../services/liveSessionSocket";
import { formatClockTime } from "../../navigation/core/format";
import { progressLabel } from "../core/riderProgress";
import { useMyRideProgress } from "../hooks/useMyRideProgress";

const STARTABLE_RIDE_STATUSES: ReadonlySet<string> = new Set(["scheduled", "active"]);

interface StartMyRideCardProps {
  rideId: string;
  rideStatus: string;
  /** The live session's status, or "not_started" before anyone opens it. */
  liveStatus: string;
  /** This rider's entry in the live session, once it exists. */
  me: LiveSessionParticipant | null;
  /** Called once this rider's ride has started, e.g. to open navigation. */
  onStarted: () => void;
}

/**
 * Lets a rider set off on their own — before the captain rolls out — and shows
 * how their own ride stands once it is under way or finished.
 */
export function StartMyRideCard({ rideId, rideStatus, liveStatus, me, onStarted }: StartMyRideCardProps) {
  const { colors } = useTheme();
  const myRide = useMyRideProgress({ rideId, me, onStarted });

  const isGroupRideOpen = STARTABLE_RIDE_STATUSES.has(rideStatus) && liveStatus !== "ended";
  if (!isGroupRideOpen) return null;

  if (myRide.isFinished) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Your ride:{" "}
          {progressLabel(
            { progress: myRide.progress, finishedAt: me?.finished_at ?? null, isOnline: true },
            formatClockTime,
          )}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          You're following the group until the captain ends the ride.
        </Text>
        <TouchableOpacity
          accessibilityRole='button'
          onPress={myRide.resumeMyRide}
          disabled={myRide.isResumingMyRide}
          style={[styles.secondary, { borderColor: colors.border, opacity: myRide.isResumingMyRide ? 0.7 : 1 }]}
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>
            {myRide.isResumingMyRide ? "Resuming…" : "Resume my ride"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (myRide.progress !== "not_started") return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Heading off now?</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Start your own ride without waiting for the captain — up to an hour before it's
        scheduled. The group sees you riding, and your distance counts.
      </Text>
      <TouchableOpacity
        accessibilityRole='button'
        onPress={myRide.startMyRide}
        disabled={myRide.isStartingMyRide}
        style={[styles.primary, { backgroundColor: colors.primary, opacity: myRide.isStartingMyRide ? 0.7 : 1 }]}
      >
        <Text style={styles.primaryText}>{myRide.isStartingMyRide ? "Starting…" : "Start my ride"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  primary: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  secondary: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
