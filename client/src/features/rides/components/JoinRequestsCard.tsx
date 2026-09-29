import React from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import { getApiErrorMessage } from "../../../utils/apiError";
import { useTheme } from "../../../theme/ThemeContext";
import { declinePrompt, type JoinRequest } from "../core/joinRequest";

interface Answer {
  riderId: string;
  accept: boolean;
}

const answerRequest = async (rideId: string, { riderId, accept }: Answer): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/requests/${riderId}`, { accept });
};

interface JoinRequestsCardProps {
  rideId: string;
  requests: readonly JoinRequest[];
  onOpenRider: (riderId: string) => void;
}

/**
 * Riders asking to join, for the captain and co-captains to accept or
 * decline. Shown only while someone is waiting.
 */
export function JoinRequestsCard({ rideId, requests, onOpenRider }: JoinRequestsCardProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const answer = useMutation({
    mutationFn: (input: Answer) => answerRequest(rideId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ride", rideId] });
      queryClient.invalidateQueries({ queryKey: ["rides"] });
    },
    onError: (error) => Alert.alert("Error", getApiErrorMessage(error, "Couldn't answer the request")),
  });

  if (requests.length === 0) return null;

  const decline = (request: JoinRequest) => {
    const prompt = declinePrompt(request);
    Alert.alert(prompt.title, prompt.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: prompt.confirmLabel,
        style: "destructive",
        onPress: () => answer.mutate({ riderId: request.rider_id, accept: false }),
      },
    ]);
  };

  const answering = answer.isPending ? answer.variables?.riderId : null;

  return (
    <View className='px-5 pt-5'>
      <Text className='text-xl font-bold mb-4' style={{ color: colors.text }}>
        Requests to join ({requests.length})
      </Text>
      {requests.map((request) => (
        <View
          key={request.rider_id}
          className='mb-3 p-3 rounded-2xl'
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          <TouchableOpacity
            onPress={() => onOpenRider(request.rider_id)}
            accessibilityRole='button'
            accessibilityLabel={`Open ${request.display_name ?? "rider"}'s profile`}
          >
            <Text className='font-bold text-base' style={{ color: colors.text }}>
              {request.display_name ?? "A rider"}
            </Text>
            {request.decline_count > 0 ? (
              <Text className='text-xs mt-0.5' style={{ color: colors.textMuted }}>
                Asking again after being declined
              </Text>
            ) : null}
          </TouchableOpacity>

          {answering === request.rider_id ? (
            <ActivityIndicator className='mt-3' color={colors.primary} />
          ) : (
            <View className='flex-row mt-3'>
              <TouchableOpacity
                onPress={() => answer.mutate({ riderId: request.rider_id, accept: true })}
                disabled={answer.isPending}
                className='flex-1 mr-2 py-2 rounded-xl items-center'
                style={{ backgroundColor: colors.primary }}
                accessibilityRole='button'
                accessibilityLabel={`Accept ${request.display_name ?? "rider"}`}
              >
                <Text className='font-bold text-white'>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => decline(request)}
                disabled={answer.isPending}
                className='flex-1 ml-2 py-2 rounded-xl items-center'
                style={{ borderWidth: 1, borderColor: colors.border }}
                accessibilityRole='button'
                accessibilityLabel={`Decline ${request.display_name ?? "rider"}`}
              >
                <Text className='font-bold' style={{ color: colors.danger }}>
                  Decline
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
