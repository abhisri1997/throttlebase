import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import { getApiErrorMessage } from "../../../utils/apiError";
import { useTheme } from "../../../theme/ThemeContext";
import {
  myAnswerLine,
  ROAD_FEEDBACK_REASONS,
  toggleReason,
  type RoadFeedback,
  type RoadFeedbackReason,
} from "../../routes/core/roadFeedback";

/** Same limit as the server's. */
const MAX_NOTE_LENGTH = 280;

interface RoadFeedbackPrompt {
  can_answer: boolean;
  route_id: string | null;
  route_title: string | null;
  feedback: RoadFeedback | null;
}

interface RoadFeedbackAnswer {
  as_described: boolean;
  reasons: RoadFeedbackReason[];
  note: string | null;
}

const roadFeedbackKey = (rideId: string) => ["road-feedback", rideId] as const;

const fetchPrompt = async (rideId: string): Promise<RoadFeedbackPrompt> => {
  const { data } = await apiClient.get<RoadFeedbackPrompt>(`/api/rides/${rideId}/road-feedback`);
  return data;
};

const sendAnswer = async (rideId: string, answer: RoadFeedbackAnswer): Promise<void> => {
  await apiClient.put(`/api/rides/${rideId}/road-feedback`, answer);
};

interface RoadFeedbackCardProps {
  rideId: string;
}

/**
 * After a ride that followed a saved route's road: "Was the road as
 * described?" Yes in one tap; "Not quite" asks what was different.
 */
export function RoadFeedbackCard({ rideId }: RoadFeedbackCardProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [isEditing, setEditing] = useState(false);
  const [isNotQuite, setNotQuite] = useState(false);
  const [reasons, setReasons] = useState<RoadFeedbackReason[]>([]);
  const [note, setNote] = useState("");

  const { data: prompt } = useQuery({ queryKey: roadFeedbackKey(rideId), queryFn: () => fetchPrompt(rideId) });

  const mutation = useMutation({
    mutationFn: (answer: RoadFeedbackAnswer) => sendAnswer(rideId, answer),
    onSuccess: () => {
      setEditing(false);
      setNotQuite(false);
      queryClient.invalidateQueries({ queryKey: roadFeedbackKey(rideId) });
      if (prompt?.route_id) queryClient.invalidateQueries({ queryKey: ["route", prompt.route_id] });
    },
  });

  if (!prompt?.can_answer) return null;

  const answer = (asDescribed: boolean) =>
    mutation.mutate({
      as_described: asDescribed,
      reasons: asDescribed ? [] : reasons,
      note: note.trim() || null,
    });

  const startOver = () => {
    const previous = prompt.feedback;
    setReasons((previous?.reasons ?? []) as RoadFeedbackReason[]);
    setNote(previous?.note ?? "");
    setNotQuite(previous ? !previous.as_described : false);
    setEditing(true);
  };

  if (prompt.feedback && !isEditing) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Thanks for telling the next rider</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{myAnswerLine(prompt.feedback)}</Text>
        <TouchableOpacity accessibilityRole='button' onPress={startOver} style={styles.linkButton}>
          <Text style={[styles.link, { color: colors.primary }]}>Change my answer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Was the road as described?</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {prompt.route_title ? `You followed the road of "${prompt.route_title}". ` : ""}
        Your answer shows on the route for the next rider.
      </Text>

      <View style={styles.choices}>
        <TouchableOpacity
          accessibilityRole='button'
          disabled={mutation.isPending}
          onPress={() => answer(true)}
          style={[styles.choice, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.choiceTextOnPrimary}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityState={{ expanded: isNotQuite }}
          disabled={mutation.isPending}
          onPress={() => setNotQuite(true)}
          style={[
            styles.choice,
            { borderColor: isNotQuite ? colors.primary : colors.border, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.choiceText, { color: colors.text }]}>Not quite</Text>
        </TouchableOpacity>
      </View>

      {isNotQuite ? (
        <View style={styles.details}>
          <Text style={[styles.label, { color: colors.text }]}>What was different?</Text>
          <View style={styles.chips}>
            {ROAD_FEEDBACK_REASONS.map((reason) => {
              const isPicked = reasons.includes(reason.value);
              return (
                <TouchableOpacity
                  key={reason.value}
                  accessibilityRole='checkbox'
                  accessibilityState={{ checked: isPicked }}
                  onPress={() => setReasons((current) => toggleReason(current, reason.value))}
                  style={[
                    styles.chip,
                    {
                      borderColor: isPicked ? colors.primary : colors.border,
                      backgroundColor: isPicked ? colors.primary + "26" : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: isPicked ? colors.primary : colors.text }]}>
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={MAX_NOTE_LENGTH}
            multiline
            placeholder='Anything the next rider should know? (optional)'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Note for the next rider'
            style={[styles.note, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
          />
          <TouchableOpacity
            accessibilityRole='button'
            disabled={mutation.isPending}
            onPress={() => answer(false)}
            style={[styles.send, { backgroundColor: colors.primary }]}
          >
            {mutation.isPending ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text style={styles.choiceTextOnPrimary}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {mutation.isError ? (
        <Text accessibilityLiveRegion='polite' style={[styles.error, { color: colors.danger }]}>
          {getApiErrorMessage(mutation.error, "Couldn't save your answer. Try again.")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12, gap: 4 },
  title: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 13 },
  choices: { flexDirection: "row", gap: 10, marginTop: 10 },
  choice: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  choiceText: { fontSize: 15, fontWeight: "700" },
  choiceTextOnPrimary: { color: "white", fontSize: 15, fontWeight: "700" },
  details: { marginTop: 14, gap: 10 },
  label: { fontSize: 14, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  chipText: { fontSize: 13, fontWeight: "600" },
  note: { minHeight: 72, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: "top" },
  send: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  linkButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  link: { fontSize: 14, fontWeight: "700" },
  error: { fontSize: 13, marginTop: 8 },
});
