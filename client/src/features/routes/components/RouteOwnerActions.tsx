import React from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import { getApiErrorMessage } from "../../../utils/apiError";
import { useTheme } from "../../../theme/ThemeContext";
import type { ConfirmPrompt } from "../../rides/core/rideLeadershipPrompts";
import {
  deleteRoutePrompt,
  visibilityLabel,
  visibilityPrompt,
  visibilityTarget,
  type RouteVisibility,
} from "../core/routeOwner";

const setVisibility = async (routeId: string, visibility: "public" | "private"): Promise<void> => {
  await apiClient.patch(`/api/routes/${routeId}`, { visibility });
};

const deleteRoute = async (routeId: string): Promise<void> => {
  await apiClient.delete(`/api/routes/${routeId}`);
};

const confirm = (prompt: ConfirmPrompt, onConfirm: () => void, isDestructive: boolean) =>
  Alert.alert(prompt.title, prompt.message, [
    { text: "Cancel", style: "cancel" },
    { text: prompt.confirmLabel, style: isDestructive ? "destructive" : "default", onPress: onConfirm },
  ]);

interface RouteOwnerActionsProps {
  route: { id: string; title: string; visibility: RouteVisibility };
  onDeleted: () => void;
}

/** For the rider who saved the route: who can see it, and deleting it. */
export function RouteOwnerActions({ route, onDeleted }: RouteOwnerActionsProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const target = visibilityTarget(route.visibility);

  // The Routes list and search share this key.
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: ["routes"] });

  const changeVisibility = useMutation({
    mutationFn: () => setVisibility(route.id, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route", route.id] });
      refreshLists();
    },
    onError: (error) => Alert.alert("Error", getApiErrorMessage(error, "Couldn't change who can see it")),
  });

  const remove = useMutation({
    mutationFn: () => deleteRoute(route.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["route", route.id] });
      refreshLists();
      onDeleted();
    },
    onError: (error) => Alert.alert("Error", getApiErrorMessage(error, "Couldn't delete the route")),
  });

  const isBusy = changeVisibility.isPending || remove.isPending;

  return (
    <View className='px-5 pt-5' style={{ gap: 8 }}>
      <Text className='text-xl font-bold' style={{ color: colors.text }}>
        Your route
      </Text>
      <Text className='text-sm' style={{ color: colors.textMuted }}>
        {visibilityLabel(route.visibility)}
      </Text>

      {isBusy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View className='flex-row' style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={() => confirm(visibilityPrompt(target, route.title), () => changeVisibility.mutate(), false)}
            className='flex-1 py-3 rounded-xl items-center'
            style={{ borderWidth: 1, borderColor: colors.border }}
            accessibilityRole='button'
          >
            <Text className='font-bold' style={{ color: colors.text }}>
              {target === "public" ? "Make public" : "Make private"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => confirm(deleteRoutePrompt(route.title), () => remove.mutate(), true)}
            className='flex-1 py-3 rounded-xl items-center'
            style={{ borderWidth: 1, borderColor: colors.border }}
            accessibilityRole='button'
          >
            <Text className='font-bold' style={{ color: colors.danger }}>
              Delete route
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
