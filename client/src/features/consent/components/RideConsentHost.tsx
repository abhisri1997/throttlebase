import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { getApiErrorMessage, getApiErrorStatus } from "../../../utils/apiError";
import { permits, type ConsentPurpose } from "../core/consent";
import { useAnswerConsent, useConsents } from "../hooks/useConsents";
import { useRideConsentPrompt } from "../hooks/rideConsentPrompt";
import { ConsentNoticeCard } from "./ConsentNoticeCard";

/**
 * What starts switched on when a rider is asked just before their ride.
 * Sharing and recording are what the ride they are starting does, so they
 * start on (plans/consent.md, "Onboarding" 3); motion sensors are extra and
 * start off. ⚖️ Counsel to confirm.
 */
const STARTS_ON: Readonly<Partial<Record<ConsentPurpose, boolean>>> = {
  live_location_sharing: true,
  ride_recording: true,
};

/**
 * What turning live location off means, now that recording is separate from
 * sharing (docs/ride-now-ux.md §7.3); null while sharing is on.
 */
const sharingOffWarning = (isSharing: boolean, isRecording: boolean): string | null => {
  if (isSharing) return null;
  if (!isRecording) {
    return "With live location and ride recording both off, this ride isn't saved and nobody on it sees where you are.";
  }
  return "With live location off, the others on this ride won't see where you are, and Alert my group can't show them where to find you. Your ride is still recorded for you.";
};

/** Mounted once at the root: shows the question the tracker asks before a ride. */
export function RideConsentHost() {
  const { colors } = useTheme();
  const request = useRideConsentPrompt((state) => state.request);
  const answer = useAnswerConsent();
  const overview = useConsents().data;
  const [choices, setChoices] = useState<Partial<Record<ConsentPurpose, boolean>>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!request) return;
    setChoices(Object.fromEntries(request.notices.map((notice) => [notice.purpose, STARTS_ON[notice.purpose] ?? false])));
  }, [request]);

  if (!request) return null;

  // A purpose not asked about here keeps the answer the rider already gave.
  const isChosen = (purpose: ConsentPurpose): boolean =>
    choices[purpose] ?? (overview ? permits(overview, purpose) : true);
  const warning = sharingOffWarning(isChosen("live_location_sharing"), isChosen("ride_recording"));

  const submit = async (): Promise<void> => {
    setSending(true);
    try {
      for (const notice of request.notices) {
        await answer.mutateAsync({
          purpose: notice.purpose,
          granted: choices[notice.purpose] ?? false,
          noticeVersion: notice.version,
          source: "contextual",
        });
      }
      request.resolve("answered");
    } catch (error) {
      // A notice changed since it was fetched: close, and the tracker asks
      // again with the new text.
      if (getApiErrorStatus(error) === 409) {
        request.resolve("answered");
        return;
      }
      Alert.alert("Couldn't save your choices", getApiErrorMessage(error, "Check your connection and try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType='slide' presentationStyle='pageSheet' onRequestClose={() => request.resolve("skipped")}>
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.heading, { color: colors.text }]}>Before your ride</Text>
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            Choose what ThrottleBase may do while you ride. You can change any of these later in Settings → Privacy.
          </Text>
          {request.notices.map((notice) => (
            <ConsentNoticeCard
              key={notice.purpose}
              notice={notice}
              value={choices[notice.purpose] ?? false}
              onChange={(next) => setChoices((current) => ({ ...current, [notice.purpose]: next }))}
              disabled={sending}
            />
          ))}
          {warning ? <Text style={[styles.warning, { color: colors.danger }]}>{warning}</Text> : null}
        </ScrollView>
        <TouchableOpacity
          accessibilityRole='button'
          onPress={() => void submit()}
          disabled={sending}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          {sending ? <ActivityIndicator color='#fff' /> : <Text style={styles.buttonText}>Save and continue</Text>}
        </TouchableOpacity>
        {/* No signal mid-ride must never leave the rider stuck behind this. */}
        <TouchableOpacity
          accessibilityRole='button'
          onPress={() => request.resolve("skipped")}
          disabled={sending}
          style={styles.later}
        >
          <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Not now</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  heading: { fontSize: 22, fontWeight: "800", marginTop: 8 },
  intro: { fontSize: 14, lineHeight: 20 },
  warning: { fontSize: 13, lineHeight: 18 },
  button: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  later: { alignItems: "center", paddingTop: 12, paddingBottom: 24 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
