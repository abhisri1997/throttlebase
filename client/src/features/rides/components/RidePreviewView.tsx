import React from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, ChevronLeft, Gauge, Lock, MapPin, Shield, Users } from "lucide-react-native";
import { apiClient } from "../../../api/client";
import { getApiErrorMessage } from "../../../utils/apiError";
import { useTheme } from "../../../theme/ThemeContext";
import { formatDuration } from "../../navigation/core/format";
import { joinedMessage, requestAction, type JoinOutcome, type RidePreview } from "../core/joinRequest";

const SECONDS_PER_MINUTE = 60;

const requestToJoin = async (rideId: string): Promise<JoinOutcome> => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/join`, {});
  return data.outcome as JoinOutcome;
};

const withdrawRequest = async (rideId: string): Promise<void> => {
  await apiClient.delete(`/api/rides/${rideId}/join`);
};

interface InfoRowProps {
  icon: React.ReactNode;
  text: string;
}

function InfoRow({ icon, text }: InfoRowProps) {
  const { colors } = useTheme();
  return (
    <View className='flex-row items-center mb-3'>
      {icon}
      <Text className='ml-3 text-base' style={{ color: colors.text }}>
        {text}
      </Text>
    </View>
  );
}

interface RidePreviewViewProps {
  ride: RidePreview;
  onBack: () => void;
}

/**
 * A ride that needs approval, as a rider not yet on it sees it: enough to
 * decide whether to ask, and the button to ask. Where it meets, where it
 * goes and who is on it arrive once the captain or a co-captain accepts.
 */
export function RidePreviewView({ ride, onBack }: RidePreviewViewProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const action = requestAction(ride.my_request);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ride", ride.id] });
    queryClient.invalidateQueries({ queryKey: ["rides"] });
  };

  const request = useMutation({
    mutationFn: () => requestToJoin(ride.id),
    onSuccess: (outcome) => {
      refresh();
      Alert.alert(outcome === "joined" ? "Success" : "Request sent", joinedMessage(outcome));
    },
    onError: (error) => Alert.alert("Error", getApiErrorMessage(error, "Couldn't send your request")),
  });

  const withdraw = useMutation({
    mutationFn: () => withdrawRequest(ride.id),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Error", getApiErrorMessage(error, "Couldn't withdraw your request")),
  });

  const onPress = () => {
    if (action.kind === "request") request.mutate();
    if (action.kind === "cancel") withdraw.mutate();
  };

  const isBusy = request.isPending || withdraw.isPending;
  const dateLabel = new Date(ride.scheduled_at).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const seatsLabel = ride.max_capacity
    ? `${ride.current_rider_count} / ${ride.max_capacity} riders`
    : `${ride.current_rider_count} riders`;
  const stopCount = ride.stop_count ?? 0;

  return (
    <SafeAreaView className='flex-1' style={{ backgroundColor: colors.bg }}>
      <View className='flex-row items-center px-4 pt-2 pb-3'>
        <TouchableOpacity
          onPress={onBack}
          className='w-10 h-10 rounded-full items-center justify-center'
          style={{ backgroundColor: colors.surface }}
          accessibilityRole='button'
          accessibilityLabel='Go back'
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }}>
        <Text className='text-3xl font-bold mb-2' style={{ color: colors.text }}>
          {ride.title}
        </Text>
        <View
          className='flex-row items-center self-start px-3 py-1 rounded-full mb-6'
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          <Lock color={colors.textMuted} size={14} />
          <Text className='ml-1.5 text-xs font-bold' style={{ color: colors.textMuted }}>
            Approval needed
          </Text>
        </View>

        <InfoRow icon={<Shield color={colors.primary} size={20} />} text={`Captain: ${ride.captain_name ?? "A rider"}`} />
        <InfoRow icon={<Calendar color={colors.primary} size={20} />} text={dateLabel} />
        {ride.estimated_duration_min ? (
          <InfoRow
            icon={<Gauge color={colors.primary} size={20} />}
            text={formatDuration(ride.estimated_duration_min * SECONDS_PER_MINUTE)}
          />
        ) : null}
        <InfoRow icon={<Users color={colors.primary} size={20} />} text={seatsLabel} />
        {stopCount > 0 ? (
          <InfoRow
            icon={<MapPin color={colors.primary} size={20} />}
            text={`${stopCount} ${stopCount === 1 ? "stop" : "stops"} planned`}
          />
        ) : null}
        {ride.requirements?.min_experience ? (
          <InfoRow
            icon={<Shield color={colors.primary} size={20} />}
            text={`Experience: ${ride.requirements.min_experience}`}
          />
        ) : null}

        <View
          className='mt-4 p-4 rounded-2xl'
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          <Text className='text-sm' style={{ color: colors.textMuted }}>
            The meeting point, route and riders are shown once the captain or a co-captain accepts you.
          </Text>
        </View>
      </ScrollView>

      <View className='absolute bottom-6 left-5 right-5 pb-5 pt-4'>
        <Text className='text-sm text-center mb-3' style={{ color: colors.textMuted }} accessibilityLiveRegion='polite'>
          {action.note}
        </Text>
        <TouchableOpacity
          onPress={onPress}
          disabled={isBusy || action.kind === "none"}
          className='p-4 rounded-2xl shadow-lg'
          style={{
            backgroundColor:
              action.kind === "request" ? colors.primary : action.kind === "cancel" ? colors.surface : colors.border,
            borderWidth: action.kind === "cancel" ? 1 : 0,
            borderColor: colors.border,
          }}
          accessibilityRole='button'
          accessibilityState={{ disabled: isBusy || action.kind === "none", busy: isBusy }}
        >
          {isBusy ? (
            <ActivityIndicator color={action.kind === "request" ? "#ffffff" : colors.text} />
          ) : (
            <Text
              className='font-bold text-center text-lg'
              style={{ color: action.kind === "request" ? "#ffffff" : colors.text }}
            >
              {action.label}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
