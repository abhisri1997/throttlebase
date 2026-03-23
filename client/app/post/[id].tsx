import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Send, MoreVertical, X } from "lucide-react-native";
import { apiClient } from "../../src/api/client";
import { useAuthStore } from "../../src/store/authStore";
import { PostCard } from "../../src/components/PostCard";
import { useTheme } from "../../src/theme/ThemeContext";

const fetchPost = async (id: string) => {
  const { data } = await apiClient.get(`/api/community/posts/${id}`);
  return data;
};

const fetchComments = async (id: string) => {
  const { data } = await apiClient.get(`/api/community/posts/${id}/comments`);
  return data;
};

export default function PostScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { rider, isAuthenticated } = useAuthStore();
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

  const handleExit = () => {
    const postPath = id ? `/post/${id}` : "/(tabs)/feed";

    if (!isAuthenticated) {
      router.replace({
        pathname: "/(auth)/login",
        params: { redirectTo: postPath },
      } as any);
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/feed");
  };

  const {
    data: post,
    isLoading: postLoading,
    error: postError,
  } = useQuery({
    queryKey: ["post", id],
    queryFn: () => fetchPost(id),
    retry: false,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => fetchComments(id),
    enabled: !!post,
    retry: false,
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (editingCommentId) {
        await apiClient.patch(`/api/community/comments/${editingCommentId}`, {
          content: commentText,
        });
      } else {
        await apiClient.post(`/api/community/posts/${id}/comments`, {
          content: commentText,
        });
      }
    },
    onSuccess: () => {
      setCommentText("");
      setEditingCommentId(null);
      Keyboard.dismiss();
      queryClient.invalidateQueries({ queryKey: ["comments", id] });
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/api/community/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", id] });
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => apiClient.post(`/api/community/posts/${id}/like`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => apiClient.delete(`/api/community/posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      router.replace("/(tabs)/feed");
    },
  });

  const isLoading = postLoading || commentsLoading;
  const postStatus = (postError as any)?.response?.status;
  const isUnauthorized = postStatus === 401 || postStatus === 403;
  const isMissing = postStatus === 404;

  if (isLoading) {
    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!post) {
    const emptyStateTitle = isUnauthorized
      ? "Login required to view this shared post."
      : isMissing
        ? "This post no longer exists or was removed."
        : "Post not found.";

    const actionLabel = isUnauthorized
      ? "Go to Login"
      : router.canGoBack()
        ? "Go Back"
        : "Go to Feed";

    return (
      <SafeAreaView
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: colors.bg }}
      >
        <Text className='text-center px-8' style={{ color: colors.textMuted }}>
          {emptyStateTitle}
        </Text>
        <TouchableOpacity onPress={handleExit} className='mt-4'>
          <Text className='font-bold' style={{ color: colors.primary }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const renderComment = ({ item }: { item: any }) => {
    const isOwner = item.rider_id === rider?.id;
    const isEdited =
      item.updated_at &&
      new Date(item.updated_at).getTime() -
        new Date(item.created_at).getTime() >
        1000;

    const handleOptions = () => {
      if (Platform.OS === "web") {
        const action = window.prompt(
          "Type 'edit' to edit, or 'delete' to delete your comment:",
        );
        if (action?.toLowerCase() === "delete") {
          if (window.confirm("Are you sure you want to delete this comment?")) {
            deleteMutation.mutate(item.id);
          }
        } else if (action?.toLowerCase() === "edit") {
          setEditingCommentId(item.id);
          setCommentText(item.content);
        }
      } else {
        Alert.alert("Comment Options", "", [
          {
            text: "Edit",
            onPress: () => {
              setEditingCommentId(item.id);
              setCommentText(item.content);
            },
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMutation.mutate(item.id),
          },
          { text: "Cancel", style: "cancel" },
        ]);
      }
    };

    return (
      <TouchableOpacity
        className='px-4 py-3 flex-row'
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        onLongPress={isOwner ? handleOptions : undefined}
        activeOpacity={0.9}
      >
        <View
          className='w-8 h-8 rounded-full items-center justify-center mr-3 mt-1'
          style={{ backgroundColor: colors.surface }}
        >
          <Text className='font-bold' style={{ color: colors.text }}>
            {item.author_name?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
        <View className='flex-1'>
          <View className='flex-row items-center justify-between mb-1'>
            <View className='flex-row items-center'>
              <Text className='font-bold mr-2' style={{ color: colors.text }}>
                {item.author_name}
              </Text>
              <Text className='text-xs' style={{ color: colors.textMuted }}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
              {isEdited && (
                <Text
                  className='text-[10px] ml-1 italic'
                  style={{ color: colors.textMuted }}
                >
                  (edited)
                </Text>
              )}
            </View>
            {isOwner && (
              <TouchableOpacity onPress={handleOptions} className='p-1'>
                <MoreVertical color={colors.textMuted} size={16} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ color: colors.text }}>{item.content}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      className='flex-1'
      style={{ backgroundColor: colors.bg }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        className='flex-row items-center px-4 py-3'
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity
          onPress={handleExit}
          className='mr-4'
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft color={colors.text} size={28} />
        </TouchableOpacity>
        <Text
          className='text-2xl font-bold tracking-tight'
          style={{ color: colors.text }}
        >
          Post
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          data={comments || []}
          keyExtractor={(item) => item.id}
          renderItem={renderComment}
          ListHeaderComponent={
            <View
              className='pt-4 pb-2'
              style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <PostCard
                post={post}
                isOwner={post.rider_id === rider?.id}
                onAuthorPress={(riderId) =>
                  router.push(`/rider/${riderId}` as any)
                }
                onLike={() => likeMutation.mutate()}
                onEdit={() =>
                  router.push({
                    pathname: "/(modals)/create-post",
                    params: { editId: post.id, defaultContent: post.content },
                  } as any)
                }
                onDelete={() => deletePostMutation.mutate()}
              />
              <Text
                className='px-4 font-bold text-lg mb-2 mt-2'
                style={{ color: colors.text }}
              >
                Comments
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View className='p-8 items-center'>
              <Text className='text-center' style={{ color: colors.textMuted }}>
                No comments yet. Be the first to start the conversation!
              </Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />

        {/* Comment Input */}
        <View
          className='flex-row items-center p-3'
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          {editingCommentId && (
            <TouchableOpacity
              onPress={() => {
                setEditingCommentId(null);
                setCommentText("");
              }}
              className='w-10 h-10 items-center justify-center rounded-full mr-2'
            >
              <X color={colors.textMuted} size={20} />
            </TouchableOpacity>
          )}
          <TextInput
            className='flex-1 px-4 py-3 rounded-full mr-2'
            style={{
              backgroundColor: colors.inputBg,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.text,
            }}
            placeholder={
              editingCommentId ? "Edit your comment..." : "Write a comment..."
            }
            placeholderTextColor={colors.textMuted}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={() => commentText.trim() && commentMutation.mutate()}
            disabled={!commentText.trim() || commentMutation.isPending}
            className='w-12 h-12 rounded-full items-center justify-center'
            style={{
              backgroundColor: commentText.trim()
                ? colors.primary
                : colors.surface,
            }}
          >
            {commentMutation.isPending ? (
              <ActivityIndicator color='white' size='small' />
            ) : (
              <Send
                color={commentText.trim() ? "white" : colors.textMuted}
                size={20}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
