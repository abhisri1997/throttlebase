import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, X } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme/ThemeContext";
const submitPost = async (content: string, editId?: string) => {
  if (editId) {
    const { data } = await apiClient.patch(`/api/community/posts/${editId}`, {
      content,
    });

    return data;
  }
  const { data } = await apiClient.post("/api/community/posts", {
    content,
    visibility: "public",
  });

  return data;
};

export default function CreatePostModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    editId?: string;
    defaultContent?: string;
  }>();
  const [content, setContent] = useState(params.defaultContent || "");
  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/feed");
    }
  };
  const mutation = useMutation({
    mutationFn: () => submitPost(content, params.editId),
    onSuccess: () => {
      // Refresh the feed and individual post cache queryClient.invalidateQueries({ queryKey: ['feed'] });

      if (params.editId) {
        queryClient.invalidateQueries({ queryKey: ["post", params.editId] });
      }
      closeModal();
    },
    onError: (err: any) => {
      Alert.alert(
        "Error",
        err.response?.data?.message || "Failed to post to timeline",
      );
    },
  });

  const handlePost = () => {
    if (!content.trim()) return;
    mutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
        <SafeAreaView
          className='flex-1 px-4 pt-4'
          style={{ backgroundColor: colors.bg }}
        >
          {/* Header */}
          <View className='flex-row justify-between items-center mb-6'>
            <TouchableOpacity
              onPress={closeModal}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X color='#64748b' size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePost}
              disabled={!content.trim() || mutation.isPending}
              className={`px-5 py-2 rounded-full ${content.trim() && !mutation.isPending ? "bg-primary-500" : "bg-slate-700"}`}
            >
              {mutation.isPending ? (
                <ActivityIndicator color='white' size='small' />
              ) : (
                <Text className={`font-bold ${content.trim() ? "" : ""}`}>
                  {params.editId ? "Save" : "Post"}{" "}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {/* Text Input */}
          <TextInput
            className='text-xl flex-1 leading-8'
            placeholder="What's on your mind? Got a route to share?"
            placeholderTextColor='#64748b'
            multiline
            autoFocus
            value={content}
            onChangeText={setContent}
            textAlignVertical='top'
          />
          {/* Toolbar */}
          <View className='border-t py-4 flex-row items-center'>
            <TouchableOpacity
              className='w-12 h-12 rounded-full items-center justify-center mr-3 border '
              onPress={() =>
                Alert.alert(
                  "Notice",
                  "Photo uploads require an S3 storage bucket configuration which is currently not implemented.",
                )
              }
            >
              <Camera color='#22c55e' size={24} />
            </TouchableOpacity>
            <Text className='text-sm flex-1'>Keep the rubber side down.</Text>
          </View>
        </SafeAreaView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
