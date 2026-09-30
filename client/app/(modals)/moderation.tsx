import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { goBackOr } from "../../src/utils/goBack";
import { useCurrentRider } from "../../src/services/useCurrentRider";
import {
  actionConsequence,
  actionLabel,
  actionsFor,
  canConfirmReason,
  reportSummary,
  type ModerationAction,
  type QueueItem,
} from "../../src/features/moderation/core/queue";

interface SuspendedRider {
  id: string;
  display_name: string;
  suspended_at: string;
  suspension_reason: string | null;
  suspended_by_name: string | null;
}

interface PendingAction {
  action: ModerationAction;
  item: QueueItem;
}

const QUEUE_KEY = ["moderation", "queue"] as const;
const SUSPENDED_KEY = ["moderation", "suspended"] as const;

/**
 * Admin only: the report queue, and riders under suspension. Every action
 * asks for a reason, which the rider sees (except for dismissals) and the
 * audit log keeps.
 */
export default function ModerationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const moderatorId = useCurrentRider().riderId;
  const [tab, setTab] = useState<"queue" | "suspended">("queue");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");

  const queue = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async () => (await apiClient.get("/api/admin/moderation/queue")).data.items as QueueItem[],
  });
  const suspended = useQuery({
    queryKey: SUSPENDED_KEY,
    queryFn: async () => (await apiClient.get("/api/admin/moderation/suspended")).data.riders as SuspendedRider[],
    enabled: tab === "suspended",
  });

  const act = useMutation({
    mutationFn: async (input: PendingAction & { reason: string }) =>
      apiClient.post("/api/admin/moderation/actions", {
        target_type: input.item.target_type,
        target_id: input.item.target_id,
        action: input.action,
        reason: input.reason,
      }),
    onSuccess: () => {
      setPending(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["moderation"] });
    },
    onError: (error) => Alert.alert("Not done", getApiErrorMessage(error)),
  });

  const open = (action: ModerationAction, item: QueueItem) => {
    setReason("");
    setPending({ action, item });
  };

  const renderItem = ({ item }: { item: QueueItem }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.kind, { color: colors.textMuted }]}>
        {item.target_type.toUpperCase()}
        {item.removed ? " · REMOVED" : ""}
      </Text>
      <Text style={[styles.preview, { color: colors.text }]} numberOfLines={4}>
        {item.preview ?? "(no longer exists)"}
      </Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {item.owner_name ? `By ${item.owner_name}${item.owner_suspended ? " (suspended)" : ""} · ` : ""}
        {reportSummary(item)}
      </Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        First reported {new Date(item.first_reported_at).toLocaleString()}
      </Text>
      {item.notes.map((note, index) => (
        <Text key={index} style={[styles.note, { color: colors.text, borderColor: colors.border }]}>
          “{note}”
        </Text>
      ))}
      <View style={styles.actions}>
        {actionsFor(item, moderatorId).map((action) => (
          <TouchableOpacity
            key={action}
            accessibilityRole='button'
            onPress={() => open(action, item)}
            style={[
              styles.action,
              action === "dismiss"
                ? { borderColor: colors.border, borderWidth: 1 }
                : { backgroundColor: action === "lift_suspension" ? colors.primary : colors.danger },
            ]}
          >
            <Text style={[styles.actionText, { color: action === "dismiss" ? colors.text : "white" }]}>
              {actionLabel(action, item)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderSuspended = ({ item }: { item: SuspendedRider }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.preview, { color: colors.text }]}>{item.display_name}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        Suspended {new Date(item.suspended_at).toLocaleString()}
        {item.suspended_by_name ? ` by ${item.suspended_by_name}` : ""}
      </Text>
      {item.suspension_reason ? (
        <Text style={[styles.note, { color: colors.text, borderColor: colors.border }]}>“{item.suspension_reason}”</Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole='button'
          onPress={() =>
            open("lift_suspension", {
              target_type: "rider",
              target_id: item.id,
              preview: item.display_name,
              removed: false,
              owner_id: item.id,
              owner_name: item.display_name,
              owner_suspended: true,
              report_count: 0,
              reasons: [],
              notes: [],
              first_reported_at: item.suspended_at,
              last_reported_at: item.suspended_at,
            })
          }
          style={[styles.action, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.actionText, { color: "white" }]}>Lift suspension</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const active = tab === "queue" ? queue : suspended;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => goBackOr(router, "/(modals)/settings")} style={styles.back}>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Moderation</Text>
      </View>

      <View style={styles.tabs}>
        {(["queue", "suspended"] as const).map((key) => (
          <TouchableOpacity
            key={key}
            accessibilityRole='tab'
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.tab, { borderBottomColor: tab === key ? colors.primary : "transparent" }]}
          >
            <Text style={{ color: tab === key ? colors.text : colors.textMuted, fontWeight: "700" }}>
              {key === "queue" ? `Reports${queue.data ? ` (${queue.data.length})` : ""}` : "Suspended"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {active.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : active.isError ? (
        <Text style={[styles.empty, { color: colors.danger }]}>{getApiErrorMessage(active.error)}</Text>
      ) : tab === "queue" ? (
        <FlatList
          data={queue.data ?? []}
          keyExtractor={(item) => `${item.target_type}:${item.target_id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={() => void queue.refetch()}
          refreshing={queue.isRefetching}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No open reports.</Text>}
        />
      ) : (
        <FlatList
          data={suspended.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderSuspended}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>Nobody is suspended.</Text>}
        />
      )}

      <Modal visible={pending !== null} transparent animationType='fade' onRequestClose={() => setPending(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPending(null)} />
        {pending ? (
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>{actionLabel(pending.action, pending.item)}</Text>
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 6 }]}>
              {actionConsequence(pending.action)}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder='Reason (kept in the audit log)'
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              style={[styles.reason, { color: colors.text, borderColor: colors.border }]}
            />
            <TouchableOpacity
              accessibilityRole='button'
              disabled={!canConfirmReason(reason) || act.isPending}
              onPress={() => act.mutate({ ...pending, reason: reason.trim() })}
              style={[
                styles.confirm,
                {
                  backgroundColor: pending.action === "dismiss" || pending.action === "lift_suspension" ? colors.primary : colors.danger,
                  opacity: canConfirmReason(reason) && !act.isPending ? 1 : 0.5,
                },
              ]}
            >
              {act.isPending ? <ActivityIndicator color='white' /> : <Text style={styles.confirmText}>Confirm</Text>}
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole='button' onPress={() => setPending(null)} style={styles.cancel}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  tabs: { flexDirection: "row", paddingHorizontal: 16 },
  tab: { paddingVertical: 12, marginRight: 20, borderBottomWidth: 2 },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  kind: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  preview: { fontSize: 15, marginTop: 4 },
  meta: { fontSize: 13, marginTop: 4 },
  note: { fontSize: 13, marginTop: 6, borderLeftWidth: 3, paddingLeft: 8, fontStyle: "italic" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  action: { minHeight: 40, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" },
  actionText: { fontSize: 14, fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 15 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { marginTop: "auto", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 32 },
  reason: { borderWidth: 1, borderRadius: 12, minHeight: 80, padding: 12, marginTop: 14, textAlignVertical: "top" },
  confirm: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 14 },
  confirmText: { color: "white", fontSize: 16, fontWeight: "800" },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 6 },
});
