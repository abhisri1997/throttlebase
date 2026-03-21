import React from 'react';
import { View, Text, TouchableOpacity, Image, Share, Alert, Platform } from 'react-native';
import { Heart, MessageCircle, Share2, MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

interface PostCardProps {
  post: {
    id: string;
    rider_id: string;
    author_name: string;
    content: string;
    media_urls?: string[];
    like_count: number;
    comment_count: number;
    created_at: string;
    updated_at?: string;
  };
  onLike?: () => void;
  onComment?: () => void;
  onAuthorPress?: (riderId: string) => void;
  isOwner?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const PostCard = ({ post, onLike, onComment, onAuthorPress, isOwner, onEdit, onDelete }: PostCardProps) => {
  const { colors } = useTheme();
  const timeAgo = new Date(post.created_at).toLocaleDateString();
  const isEdited = post.updated_at && (new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 1000);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this post on ThrottleBase:\n\n"${post.content}"\n\n- ${post.author_name}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View className="p-4 rounded-3xl mx-4 mb-4 shadow-md" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {/* Header */}
      <View className="flex-row justify-between items-center mb-3">
        <TouchableOpacity 
          className="flex-row items-center" 
          activeOpacity={0.7} 
          onPress={() => onAuthorPress?.(post.rider_id)}
        >
          <View className="w-10 h-10 bg-primary-500/20 rounded-full items-center justify-center mr-3">
            <Text className="text-primary-500 font-bold text-lg">
              {post.author_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View>
            <View className="flex-row items-center">
              <Text className="font-bold" style={{ color: colors.text }}>{post.author_name}</Text>
              {isEdited && <Text className="text-[10px] ml-2 italic" style={{ color: colors.textMuted }}>(edited)</Text>}
            </View>
            <Text className="text-xs" style={{ color: colors.textMuted }}>{timeAgo}</Text>
          </View>
        </TouchableOpacity>
        
        {isOwner && (
          <TouchableOpacity 
            onPress={() => {
              if (Platform.OS === 'web') {
                const action = window.prompt("Type 'edit' to edit, or 'delete' to delete your post:");
                if (action?.toLowerCase() === 'edit') onEdit?.();
                if (action?.toLowerCase() === 'delete' && window.confirm("Are you sure?")) onDelete?.();
              } else {
                Alert.alert('Post Options', '', [
                  { text: 'Edit', onPress: onEdit },
                  { text: 'Delete', style: 'destructive', onPress: onDelete },
                  { text: 'Cancel', style: 'cancel' }
                ])
              }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MoreHorizontal color={colors.textMuted} size={20} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <Text className="mb-4" style={{ color: colors.text }}>{post.content}</Text>

      {/* Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <Image 
          source={{ uri: post.media_urls[0] }} 
          className="w-full h-48 rounded-2xl mb-4"
          style={{ backgroundColor: colors.bg }}
          resizeMode="cover"
        />
      )}

      {/* Footer Actions */}
      <View className="flex-row pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
        <TouchableOpacity onPress={onLike} className="flex-row items-center mr-6">
          <Heart color={colors.textMuted} size={20} className="mr-2" />
          <Text className="font-medium" style={{ color: colors.textMuted }}>{post.like_count}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={onComment} className="flex-row items-center mr-6">
          <MessageCircle color={colors.textMuted} size={20} className="mr-2" />
          <Text className="font-medium" style={{ color: colors.textMuted }}>{post.comment_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleShare} className="flex-row items-center">
          <Share2 color={colors.textMuted} size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
};
