import React from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "../../src/theme/ThemeContext";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { goBackOr } from "../../src/utils/goBack";
import { statusLine, statusOf } from "../../src/features/consent/core/consent";
import { useAnswerConsent, useConsents } from "../../src/features/consent/hooks/useConsents";
import { ConsentNoticeCard } from "../../src/features/consent/components/ConsentNoticeCard";

/**
 * Settings → Privacy: every purpose, its notice, and a switch. Turning one
 * off is one tap and takes effect at once (DPDP s.6(4): withdrawing is as
 * easy as agreeing).
 */
export default function ConsentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const consents = useConsents();
  const answer = useAnswerConsent();
  const overview = consents.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => goBackOr(router, "/(modals)/settings")} style={styles.back}>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Privacy choices</Text>
      </View>

      {consents.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : !overview ? (
        <Text style={[styles.empty, { color: colors.danger }]}>
          {getApiErrorMessage(consents.error, "Couldn't load your choices. Check your connection and try again.")}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            What ThrottleBase may do with your data, one purpose at a time. Turning something off takes effect straight
            away and doesn't affect the rest of your account.
          </Text>
          {overview.notices.map((notice) => {
            const status = statusOf(overview, notice.purpose);
            const sending = answer.isPending && answer.variables?.purpose === notice.purpose;
            return (
              <ConsentNoticeCard
                key={notice.purpose}
                notice={notice}
                value={status === "granted"}
                caption={sending ? "Saving…" : statusLine(status)}
                disabled={answer.isPending}
                onChange={(granted) =>
                  answer.mutate(
                    { purpose: notice.purpose, granted, noticeVersion: notice.version, source: "settings" },
                    {
                      onError: (error) =>
                        Alert.alert(
                          "Couldn't save that",
                          getApiErrorMessage(error, "Check your connection and try again."),
                        ),
                    },
                  )
                }
              />
            );
          })}
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Rides you've already recorded stay in your history when you turn recording off. To erase them, delete your
            account.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  intro: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 15, paddingHorizontal: 16 },
});
