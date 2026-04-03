import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  RefreshCw,
  Shield,
  MessageSquare,
} from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import { getApiErrorMessage } from "../../src/utils/apiError";

const statusOptions = [
  "open",
  "in_progress",
  "awaiting_rider",
  "resolved",
  "closed",
] as const;
type TicketStatus = (typeof statusOptions)[number];

const statusLabelMap: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  awaiting_rider: "Awaiting Rider",
  resolved: "Resolved",
  closed: "Closed",
};

const statusColorMap: Record<TicketStatus, string> = {
  open: "#f59e0b",
  in_progress: "#3b82f6",
  awaiting_rider: "#8b5cf6",
  resolved: "#16a34a",
  closed: "#64748b",
};

interface SupportTicket {
  id: string;
  rider_id: string;
  rider_display_name: string;
  rider_email: string;
  category: string;
  subject: string;
  description: string;
  status: TicketStatus;
  agent_reply: string | null;
  rider_reply: string | null;
  created_at: string;
  updated_at: string;
}

export default function SupportAdminModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null,
  );
  const [newStatus, setNewStatus] = useState<TicketStatus>("open");
  const [agentReply, setAgentReply] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);

  const { data: tickets, isLoading, refetch, isRefetching } = useQuery<SupportTicket[]>({
    queryKey: ["support", "admin", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      return (await apiClient.get(`/api/support/admin/tickets?${params}`)).data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      reply,
    }: {
      id: string;
      status: TicketStatus;
      reply?: string;
    }) => {
      const body: Record<string, string> = { status };
      if (reply && reply.trim()) body.agent_reply = reply.trim();
      return (await apiClient.patch(`/api/support/${id}/status`, body)).data;
    },
    onSuccess: async () => {
      setSelectedTicket(null);
      setAgentReply("");
      setUpdateError(null);
      await queryClient.invalidateQueries({ queryKey: ["support", "admin"] });
      Alert.alert("Updated", "Ticket status has been updated.");
    },
    onError: (err: any) => {
      setUpdateError(
        getApiErrorMessage(err, "Failed to update ticket status."),
      );
    },
  });

  const openTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setAgentReply(ticket.agent_reply ?? "");
    setUpdateError(null);
  };

  if (selectedTicket) {
    return (
      <View className='flex-1' style={{ backgroundColor: colors.bg }}>
        <SafeAreaView
          className='px-4 py-3 flex-row items-center'
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
          edges={["top"]}
        >
          <TouchableOpacity
            onPress={() => setSelectedTicket(null)}
            className='p-2 mr-2'
          >
            <ChevronLeft color={colors.text} size={24} />
          </TouchableOpacity>
          <Text
            className='text-xl font-bold flex-1'
            style={{ color: colors.text }}
          >
            Ticket Detail
          </Text>
        </SafeAreaView>

        <ScrollView
          className='flex-1'
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          {/* Rider info */}
          <View
            className='rounded-2xl p-4 mb-4'
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text className='text-xs font-bold uppercase mb-1' style={{ color: colors.textMuted }}>
              Rider
            </Text>
            <Text className='font-bold text-base' style={{ color: colors.text }}>
              {selectedTicket.rider_display_name}
            </Text>
            <Text className='text-sm' style={{ color: colors.textMuted }}>
              {selectedTicket.rider_email}
            </Text>
          </View>

          {/* Ticket content */}
          <View
            className='rounded-2xl p-4 mb-4'
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <View className='flex-row items-center justify-between mb-2'>
              <Text className='font-bold text-base flex-1 mr-2' style={{ color: colors.text }}>
                {selectedTicket.subject}
              </Text>
              <View
                className='px-2 py-1 rounded'
                style={{ backgroundColor: statusColorMap[selectedTicket.status] + "22" }}
              >
                <Text
                  className='text-xs font-bold'
                  style={{ color: statusColorMap[selectedTicket.status] }}
                >
                  {statusLabelMap[selectedTicket.status]}
                </Text>
              </View>
            </View>
            <Text className='text-xs uppercase font-bold mb-2' style={{ color: colors.textMuted }}>
              {selectedTicket.category}
            </Text>
            <Text style={{ color: colors.text }}>{selectedTicket.description}</Text>
          </View>

          {/* Existing agent reply */}
          {selectedTicket.agent_reply ? (
            <View
              className='rounded-2xl p-4 mb-4'
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className='flex-row items-center mb-2'>
                <MessageSquare color={colors.primary} size={16} />
                <Text className='ml-2 font-bold text-sm' style={{ color: colors.text }}>
                  Previous Reply
                </Text>
              </View>
              <Text style={{ color: colors.textMuted }}>{selectedTicket.agent_reply}</Text>
            </View>
          ) : null}

          {selectedTicket.rider_reply ? (
            <View
              className='rounded-2xl p-4 mb-4'
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className='flex-row items-center mb-2'>
                <MessageSquare color={colors.textMuted} size={16} />
                <Text className='ml-2 font-bold text-sm' style={{ color: colors.text }}>
                  Rider Follow-up
                </Text>
              </View>
              <Text style={{ color: colors.textMuted }}>{selectedTicket.rider_reply}</Text>
            </View>
          ) : null}

          {/* Update form */}
          <View
            className='rounded-2xl p-4'
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text className='font-bold mb-3 text-sm' style={{ color: colors.text }}>
              Update Status
            </Text>
            <View className='flex-row flex-wrap gap-2 mb-4'>
              {statusOptions.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setNewStatus(s)}
                  className='px-3 py-2 rounded-lg'
                  style={{
                    backgroundColor:
                      newStatus === s
                        ? statusColorMap[s]
                        : colors.bg,
                    borderWidth: 1,
                    borderColor:
                      newStatus === s ? statusColorMap[s] : colors.border,
                  }}
                >
                  <Text
                    className='text-xs font-bold'
                    style={{
                      color: newStatus === s ? "#ffffff" : colors.textMuted,
                    }}
                  >
                    {statusLabelMap[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className='font-bold mb-2 text-sm' style={{ color: colors.text }}>
              Agent Reply (optional)
            </Text>
            <TextInput
              value={agentReply}
              onChangeText={setAgentReply}
              multiline
              numberOfLines={4}
              placeholder='Write a reply to the rider...'
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                minHeight: 100,
                textAlignVertical: "top",
                marginBottom: 12,
              }}
            />

            {updateError ? (
              <Text className='text-sm mb-3' style={{ color: colors.danger }}>
                {updateError}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={() =>
                updateStatus.mutate({
                  id: selectedTicket.id,
                  status: newStatus,
                  reply: agentReply,
                })
              }
              disabled={updateStatus.isPending}
              className='rounded-xl py-3 items-center'
              style={{ backgroundColor: colors.primary }}
            >
              {updateStatus.isPending ? (
                <ActivityIndicator color='#ffffff' />
              ) : (
                <Text className='font-bold text-white'>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className='flex-1' style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className='px-4 py-3 flex-row items-center'
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
        edges={["top"]}
      >
        <TouchableOpacity onPress={() => router.back()} className='p-2 mr-2'>
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <View className='flex-row items-center flex-1'>
          <Shield color={colors.primary} size={20} />
          <Text
            className='text-xl font-bold ml-2'
            style={{ color: colors.text }}
          >
            Support Admin
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          className='p-2'
        >
          <RefreshCw color={colors.textMuted} size={20} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Status filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className='flex-grow-0'
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
      >
        {(["all", ...statusOptions] as const).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatusFilter(s)}
            className='mr-2 px-3 py-2 rounded-full'
            style={{
              backgroundColor:
                statusFilter === s ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor:
                statusFilter === s ? colors.primary : colors.border,
            }}
          >
            <Text
              className='text-xs font-bold capitalize'
              style={{
                color: statusFilter === s ? "#ffffff" : colors.textMuted,
              }}
            >
              {s === "all" ? "All" : statusLabelMap[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator color={colors.primary} size='large' />
        </View>
      ) : (
        <FlatList
          data={tickets ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <View className='flex-1 items-center justify-center py-20'>
              <Text style={{ color: colors.textMuted }}>No tickets found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => openTicket(item)}
              className='rounded-2xl p-4 mb-3'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View className='flex-row items-start justify-between mb-1'>
                <Text
                  className='font-bold flex-1 mr-2'
                  style={{ color: colors.text }}
                  numberOfLines={1}
                >
                  {item.subject}
                </Text>
                <View
                  className='px-2 py-0.5 rounded'
                  style={{
                    backgroundColor: statusColorMap[item.status] + "22",
                  }}
                >
                  <Text
                    className='text-xs font-bold'
                    style={{ color: statusColorMap[item.status] }}
                  >
                    {statusLabelMap[item.status]}
                  </Text>
                </View>
              </View>
              <Text className='text-sm mb-1' style={{ color: colors.textMuted }}>
                {item.rider_display_name} · {item.rider_email}
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                {item.category} ·{" "}
                {new Date(item.updated_at).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
