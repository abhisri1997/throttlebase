import React, { useEffect, useMemo, useState } from "react";
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
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, X, Trash2 } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import { MentionSuggestions } from "../../src/components/MentionSuggestions";
import { getApiErrorMessage } from "../../src/utils/apiError";
import {
  applyMentionSuggestion,
  findActiveMention,
  type MentionSuggestion,
} from "../../src/utils/mentions";
import { ModalHeader } from "../../src/components/ModalHeader";
import { pickImage, uploadImage } from "../../src/services/imageUpload";

const submitPost = async (content: string, media_urls?: string[], editId?: string) => {
  if (editId) {
    const { data } = await apiClient.patch(`/api/community/posts/${editId}`, {
      content,
      media_urls,
    });

    return data;
  }
  const { data } = await apiClient.post("/api/community/posts", {
    content,
    media_urls,
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selection, setSelection] = useState({
    start: (params.defaultContent || "").length,
    end: (params.defaultContent || "").length,
  });
  const [mentionQuery, setMentionQuery] = useState("");
  const activeMention = useMemo(
    () => findActiveMention(content, selection.start),
    [content, selection.start],
  );

  useEffect(() => {
    if (!activeMention || activeMention.query.length === 0) {
      setMentionQuery("");
      return;
    }

    const timeout = setTimeout(() => {
      setMentionQuery(activeMention.query);
    }, 150);

    return () => clearTimeout(timeout);
  }, [activeMention]);

  const mentionSuggestionsQuery = useQuery({
    queryKey: ["mention-suggestions", mentionQuery],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/riders/search", {
        params: { query: mentionQuery, limit: 6 },
      });
      return data as MentionSuggestion[];
    },
    enabled: mentionQuery.length > 0,
  });

  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/feed");
    }
  };

  const handlePickImage = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;

      setIsUploadingImage(true);
      const url = await uploadImage(uri);
      setImageUrl(url);
    } catch (err) {
      Alert.alert("Error", "Failed to upload image. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => submitPost(content, imageUrl ? [imageUrl] : undefined, params.editId),
    onSuccess: () => {
      // Refresh the feed and individual post cache queryClient.invalidateQueries({ queryKey: ['feed'] });

      if (params.editId) {
        queryClient.invalidateQueries({ queryKey: ["post", params.editId] });
      }
      closeModal();
    },
    onError: (err: any) => {
      Alert.alert("Post not shared", getApiErrorMessage(err, "Failed to post to timeline"));
    },
  });

  const handlePost = () => {
    if (!content.trim() && !imageUrl) return;
    mutation.mutate();
  };

  const handleSelectMention = (suggestion: MentionSuggestion) => {
    if (!activeMention) {
      return;
    }

    const nextValue = applyMentionSuggestion(
      content,
      activeMention,
      suggestion.username,
    );
    setContent(nextValue.text);
    setSelection({ start: nextValue.cursor, end: nextValue.cursor });
    setMentionQuery("");
  };

  const showMentionSuggestions =
    !!activeMention &&
    mentionQuery.length > 0 &&
    (mentionSuggestionsQuery.isLoading ||
      (mentionSuggestionsQuery.data?.length ?? 0) > 0);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 50 : 0}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
        <SafeAreaView
          className='flex-1'
          style={{ backgroundColor: colors.bg }}
          edges={["top"]}
        >
          <ModalHeader
            leftAction="close"
            onLeftPress={closeModal}
            rightAction={{
              label: params.editId ? "Save" : "Post",
              onPress: handlePost,
              disabled: !content.trim() && !imageUrl,
              loading: mutation.isPending || isUploadingImage,
              variant: "pill"
            }}
          />
          {/* Text Input */}
          <TextInput
            className='text-xl px-4 pt-4'
            style={{ color: colors.text, minHeight: 120 }}
            placeholder="What's on your mind? Got a route to share?"
            placeholderTextColor='#64748b'
            multiline
            autoFocus
            value={content}
            onChangeText={setContent}
            selection={selection}
            onSelectionChange={({ nativeEvent }) =>
              setSelection(nativeEvent.selection)
            }
            textAlignVertical='top'
          />
          
          {imageUrl && (
            <View className="px-4 mt-2 mb-4 relative">
              <Image 
                source={{ uri: imageUrl }} 
                className="w-full h-64 rounded-xl" 
                resizeMode="cover"
              />
              <TouchableOpacity 
                className="absolute top-2 right-6 w-8 h-8 rounded-full items-center justify-center bg-black/50"
                onPress={() => setImageUrl(null)}
              >
                <Trash2 color="white" size={16} />
              </TouchableOpacity>
            </View>
          )}

          {isUploadingImage && (
            <View className="px-4 mt-2 mb-4 items-center justify-center h-64 rounded-xl" style={{ backgroundColor: colors.inputBg }}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={{ color: colors.textMuted, marginTop: 12 }}>Uploading photo...</Text>
            </View>
          )}

          {showMentionSuggestions ? (
            <View className='mb-4'>
              <MentionSuggestions
                visible={showMentionSuggestions}
                suggestions={mentionSuggestionsQuery.data ?? []}
                isLoading={mentionSuggestionsQuery.isLoading}
                onSelect={handleSelectMention}
              />
            </View>
          ) : null}
          {/* Toolbar */}
          <View className='border-t py-4 px-4 flex-row items-center' style={{ borderTopColor: colors.border }}>
            <TouchableOpacity
              className='w-12 h-12 rounded-full items-center justify-center mr-3 border'
              style={{ borderColor: colors.border }}
              onPress={handlePickImage}
              disabled={isUploadingImage}
            >
              <Camera color='#22c55e' size={24} />
            </TouchableOpacity>
            <Text className='text-sm flex-1' style={{ color: colors.textMuted }}>Keep the rubber side down.</Text>
          </View>
        </SafeAreaView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
