import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import {
  canSubmitReport,
  MAX_REPORT_NOTE_LENGTH,
  REPORT_REASONS,
  reportTitle,
  type ReportReason,
  type ReportTarget,
} from "../core/report";

interface ReportSheetProps {
  target: ReportTarget | null;
  isSending: boolean;
  onSubmit: (reason: ReportReason, note: string, alsoBlock: boolean) => void;
  onClose: () => void;
}

/** Why it's being reported, an optional note, and whether to block too. */
export function ReportSheet({ target, isSending, onSubmit, onClose }: ReportSheetProps) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);

  // Each report starts fresh.
  useEffect(() => {
    setReason(null);
    setNote("");
    // Someone reported as a rider is usually someone to stop hearing from.
    setAlsoBlock(target?.type === "rider");
  }, [target?.type, target?.id]);

  if (!target) return null;
  const canSend = canSubmitReport(reason, note) && !isSending;

  return (
    <Modal visible transparent animationType='slide' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel='Close' />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView keyboardShouldPersistTaps='handled'>
            <Text style={[styles.title, { color: colors.text }]}>{reportTitle(target)}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Why are you reporting it? The rider isn't told who reported them.
            </Text>

            {REPORT_REASONS.map((entry) => {
              const selected = entry.reason === reason;
              return (
                <TouchableOpacity
                  key={entry.reason}
                  accessibilityRole='radio'
                  accessibilityState={{ selected }}
                  onPress={() => setReason(entry.reason)}
                  style={[
                    styles.reason,
                    { borderColor: selected ? colors.primary : colors.border },
                  ]}
                >
                  <Text style={[styles.reasonLabel, { color: colors.text }]}>{entry.label}</Text>
                  <Text style={[styles.reasonHint, { color: colors.textMuted }]}>{entry.hint}</Text>
                </TouchableOpacity>
              );
            })}

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={reason === "other" ? "What's wrong? (needed)" : "Anything else we should know? (optional)"}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_REPORT_NOTE_LENGTH}
              style={[styles.note, { color: colors.text, borderColor: colors.border }]}
            />

            {target.ownerName ? (
              <View style={styles.blockRow}>
                <Text style={[styles.blockText, { color: colors.text }]}>Also block {target.ownerName}</Text>
                <Switch value={alsoBlock} onValueChange={setAlsoBlock} />
              </View>
            ) : null}

            <TouchableOpacity
              accessibilityRole='button'
              disabled={!canSend}
              onPress={() => reason && onSubmit(reason, note, alsoBlock)}
              style={[styles.send, { backgroundColor: colors.danger, opacity: canSend ? 1 : 0.5 }]}
            >
              {isSending ? <ActivityIndicator color='white' /> : <Text style={styles.sendText}>Send report</Text>}
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole='button' onPress={onClose} style={styles.cancel}>
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "85%",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: "800" },
  body: { fontSize: 14, marginTop: 4, marginBottom: 14 },
  reason: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  reasonLabel: { fontSize: 15, fontWeight: "700" },
  reasonHint: { fontSize: 12, marginTop: 2 },
  note: { borderWidth: 1, borderRadius: 12, minHeight: 72, padding: 12, marginTop: 6, textAlignVertical: "top" },
  blockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  blockText: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  send: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 16 },
  sendText: { color: "white", fontSize: 16, fontWeight: "800" },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 6 },
  cancelText: { fontSize: 15, fontWeight: "600" },
});
