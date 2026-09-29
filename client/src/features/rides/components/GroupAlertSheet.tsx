import React from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Phone, Siren } from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { EMERGENCY_DIAL_URL, GROUP_ALERT_DISCLAIMER } from "../core/groupAlert";

interface GroupAlertSheetProps {
  visible: boolean;
  isSending: boolean;
  onSend: () => void;
  onClose: () => void;
}

/**
 * "Alert my group", with an equally large "Call 112" beside it. Both are big
 * enough to hit with a gloved thumb, and nothing here needs typing.
 */
export function GroupAlertSheet({ visible, isSending, onSend, onClose }: GroupAlertSheetProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType='slide' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel='Close' />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Alert my group</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Send an alert with your location to everyone on this ride?
        </Text>

        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel='Alert my group'
          onPress={onSend}
          disabled={isSending}
          style={[styles.big, { backgroundColor: colors.danger, opacity: isSending ? 0.7 : 1 }]}
        >
          {isSending ? <ActivityIndicator color='white' /> : <Siren color='white' size={24} />}
          <Text style={styles.bigText}>{isSending ? "Sending…" : "Alert my group"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel='Call 112, emergency'
          onPress={() => void Linking.openURL(EMERGENCY_DIAL_URL)}
          style={[styles.big, styles.call, { borderColor: colors.danger }]}
        >
          <Phone color={colors.danger} size={24} />
          <Text style={[styles.bigText, { color: colors.danger }]}>Call 112 (emergency)</Text>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>{GROUP_ALERT_DISCLAIMER}</Text>

        <TouchableOpacity accessibilityRole='button' onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  body: {
    fontSize: 15,
    marginTop: 6,
    marginBottom: 16,
  },
  big: {
    minHeight: 64,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  call: {
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  bigText: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 10,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  cancel: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
