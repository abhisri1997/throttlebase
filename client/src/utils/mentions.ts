export interface MentionedRiderReference {
  rider_id: string;
  username: string;
  display_name: string | null;
}

export interface MentionSuggestion {
  id: string;
  username: string;
  display_name: string;
  is_following: boolean;
}

export interface ActiveMentionMatch {
  query: string;
  start: number;
  end: number;
}

const ACTIVE_MENTION_REGEX = /(^|\s)@([a-zA-Z0-9_]*)$/;
const MENTION_SEGMENT_REGEX = /@([a-zA-Z0-9_]{1,50})/g;

export const findActiveMention = (
  text: string,
  cursorPosition: number,
): ActiveMentionMatch | null => {
  const safeCursor = Math.max(0, Math.min(cursorPosition, text.length));
  const textBeforeCursor = text.slice(0, safeCursor);
  const match = ACTIVE_MENTION_REGEX.exec(textBeforeCursor);

  if (!match) {
    return null;
  }

  const start = textBeforeCursor.lastIndexOf("@");
  if (start < 0) {
    return null;
  }

  return {
    query: match[2] ?? "",
    start,
    end: safeCursor,
  };
};

export const applyMentionSuggestion = (
  text: string,
  match: ActiveMentionMatch,
  username: string,
) => {
  const nextText = `${text.slice(0, match.start)}@${username} ${text.slice(match.end)}`;
  const nextCursor = match.start + username.length + 2;

  return {
    text: nextText,
    cursor: nextCursor,
  };
};

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; rider: MentionedRiderReference };

export const splitMentionSegments = (
  content: string,
  mentionedRiders: MentionedRiderReference[] = [],
): MentionSegment[] => {
  const mentionMap = new Map(
    mentionedRiders.map((rider) => [rider.username.toLowerCase(), rider]),
  );

  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_SEGMENT_REGEX.exec(content)) !== null) {
    const fullMatch = match[0];
    const handle = (match[1] ?? "").toLowerCase();
    const rider = mentionMap.get(handle);
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      segments.push({
        type: "text",
        value: content.slice(lastIndex, startIndex),
      });
    }

    if (rider) {
      segments.push({
        type: "mention",
        value: fullMatch,
        rider,
      });
    } else {
      segments.push({
        type: "text",
        value: fullMatch,
      });
    }

    lastIndex = startIndex + fullMatch.length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      value: content.slice(lastIndex),
    });
  }

  return segments;
};