import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CircleAlert, LifeBuoy } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useTheme } from "../../src/theme/ThemeContext";
import { getApiErrorMessage } from "../../src/utils/apiError";

const supportCategories = [
  { value: "bug", label: "Bug" },
  { value: "dispute", label: "Dispute" },
  { value: "account", label: "Account" },
  { value: "general", label: "General" },
] as const;

type SupportCategory = (typeof supportCategories)[number]["value"];

const statusLabelMap: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  awaiting_rider: "Awaiting Rider",
  resolved: "Resolved",
  closed: "Closed",
};

const statusColorMap = {
  open: "#f59e0b",
  in_progress: "#3b82f6",
  awaiting_rider: "#8b5cf6",
  resolved: "#16a34a",
  closed: "#64748b",
} satisfies Record<string, string>;

export default function SupportModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [category, setCategory] = useState<SupportCategory>("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support", "tickets"],
    queryFn: async () => (await apiClient.get("/api/support")).data,
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const attachmentUrls = attachments
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);

      return apiClient.post("/api/support", {
        category,
        subject: subject.trim(),
        description: description.trim(),
        attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : undefined,
      });
    },
    onSuccess: async () => {
      setSubject("");
      setDescription("");
      setAttachments("");
      setCategory("general");
      setSubmitError(null);
      await queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      Alert.alert(
        "Support ticket created",
        "We saved your request and it is now visible below.",
      );
    },
    onError: (error: any) => {
      setSubmitError(
        getApiErrorMessage(error, "Unable to create support ticket right now."),
      );
    },
  });

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
        <Text
          className='text-xl font-bold flex-1'
          style={{ color: colors.text }}
        >
          Support Center
        </Text>
      </SafeAreaView>

      <ScrollView
        className='flex-1'
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className='px-4 pt-6'>
          <View
            className='rounded-3xl p-5'
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View className='flex-row items-center mb-4'>
              <LifeBuoy color={colors.primary} size={20} />
              <Text
                className='text-lg font-bold ml-2'
                style={{ color: colors.text }}
              >
                Create a ticket
              </Text>
            </View>

            <Text className='text-sm mb-3' style={{ color: colors.textMuted }}>
              Share the issue clearly and include optional attachment URLs if
              you already uploaded screenshots elsewhere.
            </Text>

            <Text
              className='text-sm font-medium mb-2 ml-1'
              style={{ color: colors.text }}
            >
              Category
            </Text>
            <View className='flex-row flex-wrap mb-4'>
              {supportCategories.map((option) => {
                const selected = category === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setCategory(option.value)}
                    className='px-4 py-2 rounded-full mr-2 mb-2'
                    style={{
                      backgroundColor: selected
                        ? colors.primary
                        : colors.inputBg,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      className='font-bold text-sm'
                      style={{ color: selected ? "#ffffff" : colors.text }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input
              label='Subject'
              value={subject}
              onChangeText={setSubject}
              placeholder='Short summary of the issue'
              autoCapitalize='sentences'
            />

            <View className='mb-4'>
              <Text
                className='text-sm font-medium mb-1.5 ml-1'
                style={{ color: colors.text }}
              >
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder='What happened, what you expected, and anything else useful for diagnosis'
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical='top'
                className='px-4 py-3.5 rounded-xl font-medium'
                style={{
                  minHeight: 140,
                  backgroundColor: colors.inputBg,
                  borderWidth: 1,
                  borderColor: submitError ? colors.danger : colors.border,
                  color: colors.text,
                }}
              />
            </View>

            <View className='mb-4'>
              <Text
                className='text-sm font-medium mb-1.5 ml-1'
                style={{ color: colors.text }}
              >
                Attachment URLs
              </Text>
              <TextInput
                value={attachments}
                onChangeText={setAttachments}
                placeholder='Optional: one URL per line or comma-separated'
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical='top'
                className='px-4 py-3.5 rounded-xl font-medium'
                style={{
                  minHeight: 84,
                  backgroundColor: colors.inputBg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              />
            </View>

            {submitError ? (
              <View
                className='flex-row items-start rounded-2xl px-4 py-3 mb-4'
                style={{
                  backgroundColor: `${colors.danger}15`,
                  borderWidth: 1,
                  borderColor: `${colors.danger}40`,
                }}
              >
                <CircleAlert color={colors.danger} size={18} />
                <Text className='ml-2 flex-1' style={{ color: colors.danger }}>
                  {submitError}
                </Text>
              </View>
            ) : null}

            <Button
              onPress={() => {
                setSubmitError(null);
                createTicket.mutate();
              }}
              title='Submit Ticket'
              isLoading={createTicket.isPending}
              disabled={!subject.trim() || !description.trim()}
            />
          </View>
        </View>

        <View className='px-4 pt-6'>
          <Text
            className='text-lg font-bold mb-3'
            style={{ color: colors.text }}
          >
            My Tickets
          </Text>

          {isLoading ? (
            <View className='py-8 items-center'>
              <ActivityIndicator color={colors.primary} size='large' />
            </View>
          ) : tickets?.length > 0 ? (
            tickets.map((ticket: any) => {
              const statusKey =
                typeof ticket.status === "string" ? ticket.status : "";
              const statusColor =
                statusColorMap[statusKey as keyof typeof statusColorMap] ??
                colors.textMuted;

              return (
                <View
                  key={ticket.id}
                  className='rounded-3xl p-4 mb-3'
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View className='flex-row items-start justify-between mb-2'>
                    <View className='flex-1 pr-3'>
                      <Text
                        className='font-bold text-base'
                        style={{ color: colors.text }}
                      >
                        {ticket.subject}
                      </Text>
                      <Text
                        className='capitalize mt-1'
                        style={{ color: colors.textMuted }}
                      >
                        {ticket.category}
                      </Text>
                    </View>
                    <View
                      className='px-3 py-1 rounded-full'
                      style={{
                        backgroundColor: `${statusColor}20`,
                        borderWidth: 1,
                        borderColor: `${statusColor}40`,
                      }}
                    >
                      <Text
                        className='text-xs font-bold'
                        style={{ color: statusColor }}
                      >
                        {statusLabelMap[statusKey] ?? statusKey}
                      </Text>
                    </View>
                  </View>

                  <Text className='mb-3' style={{ color: colors.text }}>
                    {ticket.description}
                  </Text>

                  <Text className='text-xs' style={{ color: colors.textMuted }}>
                    Updated {new Date(ticket.updated_at).toLocaleString()}
                  </Text>
                </View>
              );
            })
          ) : (
            <View
              className='rounded-3xl p-5'
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted }}>
                No support tickets yet. Create one above when you need help with
                account, ride, or app issues.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
