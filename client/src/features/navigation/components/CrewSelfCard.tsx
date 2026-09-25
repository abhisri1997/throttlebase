import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { formatClockTime } from "../core/format";
import { crewRoleLabel } from "../core/crewRole";
import { progressLabel } from "../../rides/core/riderProgress";
import type { RideParticipantView } from "../types/navigation";
import { crewStatusColor } from "./crewStatusColor";

export interface MyRideControls {
  isRiding: boolean;
  isFinished: boolean;
  /** The group ride is still live, so a finish can be taken back. */
  canResume: boolean;
  onFinish: () => void;
  onResume: () => void;
  isBusy: boolean;
}

interface CrewSelfCardProps {
  self: RideParticipantView;
  myRide?: MyRideControls;
}

/**
 * The current rider, apart from the crew: how the group sees them, and their
 * own ride's controls. Not tappable — re-center already shows where they are.
 */
export function CrewSelfCard({ self, myRide }: CrewSelfCardProps) {
  const { colors } = useTheme();
  const status = progressLabel(
    { progress: self.progress, finishedAt: self.finishedAt, isOnline: self.isOnline },
    formatClockTime,
  );
  const action = myRide?.isRiding
    ? { label: myRide.isBusy ? "Finishing…" : "Finish my ride", onPress: myRide.onFinish, isPrimary: true }
    : myRide?.isFinished && myRide.canResume
      ? { label: myRide.isBusy ? "Resuming…" : "Resume", onPress: myRide.onResume, isPrimary: false }
      : null;

  return (
    <View
      accessible={!action}
      accessibilityLabel={`You, ${crewRoleLabel(self.role)}, ${status}`}
      style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.primary }]}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          You
        </Text>
        <Text
          style={[styles.status, { color: crewStatusColor(self.progress, colors) }]}
          numberOfLines={1}
        >
          {crewRoleLabel(self.role)} · {status}
        </Text>
      </View>

      {action ? (
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel={action.label}
          onPress={action.onPress}
          disabled={myRide?.isBusy}
          hitSlop={8}
          style={[
            styles.action,
            action.isPrimary
              ? { backgroundColor: colors.primary }
              : { borderWidth: 1, borderColor: colors.border },
            { opacity: myRide?.isBusy ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.actionText, { color: action.isPrimary ? "white" : colors.text }]}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  text: {
    flex: 1,
    paddingRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
  },
  status: {
    fontSize: 12,
    marginTop: 2,
  },
  action: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
