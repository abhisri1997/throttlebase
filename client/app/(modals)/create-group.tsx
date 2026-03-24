import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { getApiErrorMessage } from "../../src/utils/apiError";
import { Input } from "../../src/components/Input";
import { useTheme } from "../../src/theme/ThemeContext";

type Visibility = "public" | "private";

export default function CreateGroupModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      };
      const { data } = await apiClient.post("/api/community/groups", payload);
      return data;
    },
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      if (group?.id) {
        router.replace(`/group/${group.id}` as any);
        return;
      }
      router.replace("/(tabs)/groups");
    },
    onError: (err: any) => {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to create group"));
    },
  });

  const canSubmit = Boolean(name.trim()) && !createMutation.isPending;

  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/groups");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <SafeAreaView
        className='flex-1 px-4 pt-4'
        style={{ backgroundColor: colors.bg }}
      >
        <View className='flex-row justify-between items-center mb-5'>
          <TouchableOpacity
            onPress={closeModal}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X color={colors.textMuted} size={24} />
          </TouchableOpacity>
          <Text className='text-lg font-bold' style={{ color: colors.text }}>
            Create Group
          </Text>
          <TouchableOpacity
            onPress={() => createMutation.mutate()}
            disabled={!canSubmit}
            className='px-4 py-2 rounded-full'
            style={{
              backgroundColor: canSubmit ? colors.primary : colors.border,
            }}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size='small' color='white' />
            ) : (
              <Text className='font-bold text-white'>Create</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView className='flex-1'>
          <Input
            label='Group Name'
            value={name}
            onChangeText={setName}
            placeholder='Weekend Warriors'
            maxLength={255}
          />

          <Input
            label='Description (optional)'
            value={description}
            onChangeText={setDescription}
            placeholder='Group for scenic weekend rides and chai stops'
            multiline
            maxLength={2000}
            numberOfLines={5}
            style={{ minHeight: 110, textAlignVertical: "top" }}
          />

          <Text
            className='text-sm font-medium mb-2 ml-1'
            style={{ color: colors.text }}
          >
            Visibility
          </Text>
          <View className='flex-row mb-6'>
            {(["public", "private"] as const).map((option) => {
              const selected = visibility === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setVisibility(option)}
                  className='px-4 py-2 rounded-full mr-2'
                  style={{
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className='font-semibold capitalize'
                    style={{ color: selected ? "#ffffff" : colors.text }}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
