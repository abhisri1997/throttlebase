import React, { useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import type { ConsentNotice } from "../core/consent";

interface Props {
  notice: ConsentNotice;
  value: boolean;
  onChange: (next: boolean) => void;
  /** A line under the title, such as the current status. */
  caption?: string;
  disabled?: boolean;
}

/**
 * One purpose: its title, the notice exactly as the server sent it, and a
 * switch. The notice is folded to its first paragraph; the rest (how to
 * withdraw, how to complain) is one tap away.
 */
export function ConsentNoticeCard({ notice, value, onChange, caption, disabled }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [lead, ...rest] = notice.body.split("\n\n");

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={[styles.title, { color: colors.text }]}>{notice.title}</Text>
          {caption ? <Text style={[styles.caption, { color: colors.textMuted }]}>{caption}</Text> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={notice.title}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <Text style={[styles.body, { color: colors.textMuted }]}>{lead}</Text>
      {rest.length > 0 ? (
        expanded ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>{rest.join("\n\n")}</Text>
        ) : (
          <TouchableOpacity accessibilityRole='button' onPress={() => setExpanded(true)}>
            <Text style={[styles.more, { color: colors.primary }]}>How to change this or complain</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  titles: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700" },
  caption: { fontSize: 12, marginTop: 2 },
  body: { fontSize: 13, lineHeight: 19 },
  more: { fontSize: 13, fontWeight: "600" },
});
