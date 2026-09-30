import React, { type ReactNode } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "../theme/ThemeContext";
import type { LegalBlock, LegalDocument } from "../core/legal/legalDocument";

interface LegalDocumentViewProps {
  document: LegalDocument;
  /** Shown right under the summary, e.g. the form on the deletion page. */
  children?: ReactNode;
}

/** Keeps lines readable on the website; phones use the full width. */
const MAX_TEXT_WIDTH = 720;

function Bullets({ items, color }: { items: readonly string[]; color: string }) {
  return (
    <View className="mb-3">
      {items.map((item) => (
        <View key={item} className="flex-row mb-2">
          <Text className="text-base leading-6 mr-2" style={{ color }}>
            •
          </Text>
          <Text className="text-base leading-6 flex-1" style={{ color }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Block({ block, color }: { block: LegalBlock; color: string }) {
  if (block.kind === "list") return <Bullets items={block.items} color={color} />;
  return (
    <Text className="text-base leading-6 mb-3" style={{ color }}>
      {block.text}
    </Text>
  );
}

/** A legal page (Privacy Policy, Terms, deletion page), readable signed in or out, in the app and on the web. */
export function LegalDocumentView({ document, children }: LegalDocumentViewProps) {
  const { colors } = useTheme();
  const router = useRouter();

  // Opened straight from a link on the web there is nothing to go back to.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <SafeAreaView
        className="px-4 pt-2 pb-4 flex-row items-center"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
        edges={["top"]}
      >
        <TouchableOpacity
          onPress={goBack}
          className="w-10 h-10 items-center justify-center mr-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text className="text-xl font-bold" style={{ color: colors.text }} accessibilityRole="header">
          {document.title}
        </Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View style={{ width: "100%", maxWidth: MAX_TEXT_WIDTH, alignSelf: "center" }}>
          <Text className="text-sm mb-4" style={{ color: colors.textMuted }}>
            Version {document.version}
          </Text>

          {document.status === "draft" ? (
            <View
              className="rounded-xl p-3 mb-4"
              style={{ borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface }}
            >
              <Text className="text-sm leading-5" style={{ color: colors.text }}>
                Draft under legal review. Details in [brackets] are still to be filled in.
              </Text>
            </View>
          ) : null}

          <View
            className="rounded-xl p-4 mb-6"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text className="text-lg font-bold mb-3" style={{ color: colors.text }} accessibilityRole="header">
              In short
            </Text>
            <Bullets items={document.summary} color={colors.text} />
          </View>

          {children}

          {document.sections.map((section) => (
            <View key={section.heading} className="mb-4">
              <Text className="text-lg font-bold mb-2" style={{ color: colors.text }} accessibilityRole="header">
                {section.heading}
              </Text>
              {section.blocks.map((block, index) => (
                <Block key={`${section.heading}-${index}`} block={block} color={colors.text} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
