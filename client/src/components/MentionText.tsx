import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import {
  splitMentionSegments,
  type MentionedRiderReference,
} from "../utils/mentions";

interface MentionTextProps {
  content: string;
  mentionedRiders?: MentionedRiderReference[];
  textStyle?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  onMentionPress?: (riderId: string) => void;
}

export const MentionText = ({
  content,
  mentionedRiders = [],
  textStyle,
  mentionStyle,
  onMentionPress,
}: MentionTextProps) => {
  const segments = splitMentionSegments(content, mentionedRiders);

  return (
    <Text style={textStyle}>
      {segments.map((segment, index) => {
        if (segment.type === "mention") {
          return (
            <Text
              key={`${segment.rider.rider_id}-${index}`}
              style={mentionStyle}
              onPress={() => onMentionPress?.(segment.rider.rider_id)}
            >
              {segment.value}
            </Text>
          );
        }

        return <Text key={`text-${index}`}>{segment.value}</Text>;
      })}
    </Text>
  );
};