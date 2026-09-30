import React, { type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, ChevronRight, Zap } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";

interface ChoiceRowProps {
  icon: ReactNode;
  title: string;
  detail: string;
  onPress: () => void;
}

function ChoiceRow({ icon, title, detail, onPress }: ChoiceRowProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      accessibilityRole='button'
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.bg, borderColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.inputBg }]}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      <ChevronRight color={colors.textMuted} size={20} />
    </TouchableOpacity>
  );
}

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
  const { bottom } = useSafeAreaInsets();

  // The sheet closes before the next screen opens, so the two don't animate over each other.
  const choose = (next: () => void) => () => {
    onClose();
    next();
  };

  return (
    <Modal visible={visible} transparent animationType='slide' onRequestClose={onClose}>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Close'
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: 24 + bottom },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text accessibilityRole='header' style={[styles.title, { color: colors.text }]}>
          Start a Ride
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Ride now, or plan one for later.</Text>

        <View style={styles.rows}>
          <ChoiceRow
            icon={<Zap color={colors.text} size={20} />}
            title='Ride Now'
            detail='Start riding now, alone or with riders you invite.'
            onPress={choose(onRideNow)}
          />
          <ChoiceRow
            icon={<CalendarDays color={colors.text} size={20} />}
            title='Plan a Ride'
            detail='Set a date, a route and who can join.'
            onPress={choose(onPlanRide)}
          />
        </View>

        <TouchableOpacity accessibilityRole='button' onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  rows: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  rowDetail: {
    fontSize: 14,
  },
  cancel: {
    marginTop: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
