import React from "react";
import { CalendarDays, Zap } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import ActionSheet, { ActionSheetItem } from "../../../components/ActionSheet";

interface StartRideSheetProps {
  visible: boolean;
  onClose: () => void;
  onRideNow: () => void;
  onPlanRide: () => void;
}

/**
 * What Discover's "+" opens (docs/ride-now-ux.md §4.1): ride now, or plan a
 * ride for later. The rows for a ride under way or about to start come later.
 */
export function StartRideSheet({ visible, onClose, onRideNow, onPlanRide }: StartRideSheetProps) {
  const { colors } = useTheme();

  // The sheet closes before the next screen opens, so the two don't animate over each other.
  const choose = (next: () => void) => () => {
    onClose();
    next();
  };

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Start a Ride"
      subtitle="Ride now, or plan one for later."
    >
      <ActionSheetItem
        icon={Zap}
        iconColor={colors.primary}
        title="Ride Now"
        subtitle="Start riding now, alone or with riders you invite."
        onPress={choose(onRideNow)}
      />
      <ActionSheetItem
        icon={CalendarDays}
        iconColor={colors.primary}
        title="Plan a Ride"
        subtitle="Set a date, a route and who can join."
        onPress={choose(onPlanRide)}
        isLast
      />
    </ActionSheet>
  );
}
