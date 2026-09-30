import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { goBackOr } from "../../src/utils/goBack";
import { reportHeadline, reportTimeline, type MyReport } from "../../src/features/moderation/core/myReports";

/**
 * The rider's own reports: each one's reference, where it stands, and when
 * it's due. Every report is a complaint to the Grievance Officer.
 */
export default function MyReportsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const reports = useQuery({
    queryKey: ["reports", "mine"],
    queryFn: async () => (await apiClient.get("/api/reports/mine")).data.reports as MyReport[],
  });

  const statusColor = (report: MyReport): string =>
    report.status === "open" ? (report.overdue ? colors.danger : colors.textMuted) : colors.primary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => goBackOr(router, "/(modals)/settings")} style={styles.back}>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Your reports</Text>
      </View>

      {reports.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : reports.isError ? (
        <Text style={[styles.empty, { color: colors.danger }]}>{getApiErrorMessage(reports.error)}</Text>
      ) : (
        <FlatList
          data={reports.data ?? []}
          keyExtractor={(report) => report.id}
          contentContainerStyle={styles.list}
          onRefresh={() => void reports.refetch()}
          refreshing={reports.isRefetching}
          ListHeaderComponent={
            <Text style={[styles.intro, { color: colors.textMuted }]}>
              We review reports within 24 hours and resolve them within 7 days (72 hours for sexual content). The
              rider you reported isn't told who reported them.
            </Text>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              You haven't reported anything. Tap Report on a post, comment, rider, ride or route if something is wrong.
            </Text>
          }
          ListFooterComponent={
            <TouchableOpacity accessibilityRole='link' onPress={() => router.push("/grievance")} style={styles.footer}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Contact the Grievance Officer</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.row}>
                <Text style={[styles.headline, { color: colors.text }]}>{reportHeadline(item)}</Text>
                <Text style={[styles.reference, { color: colors.textMuted }]}>{item.reference}</Text>
              </View>
              <Text style={[styles.outcome, { color: statusColor(item) }]}>{item.outcome}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Sent {new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {reportTimeline(item)}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  list: { padding: 16, gap: 12 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  headline: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  reference: { fontSize: 12, fontVariant: ["tabular-nums"] },
  outcome: { fontSize: 14, marginTop: 6, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 15, paddingHorizontal: 16 },
  footer: { alignItems: "center", paddingVertical: 16 },
});
