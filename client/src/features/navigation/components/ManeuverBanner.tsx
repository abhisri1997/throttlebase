import React, { memo, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Merge,
  Navigation,
  RotateCcw,
  RotateCw,
  Split,
} from "lucide-react-native";
import type { NavigationColors } from "../../../theme/navigationColors";
import { formatDistance } from "../core/format";
import type { Guidance } from "../core/guidance";
import type { ManeuverIconKind } from "../core/maneuver";

interface IconProps {
  color: string;
  size: number;
  strokeWidth?: number;
}

const MANEUVER_ICONS: Readonly<Record<ManeuverIconKind, ComponentType<IconProps>>> = {
  "turn-left": CornerUpLeft,
  "turn-right": CornerUpRight,
  "slight-left": ArrowUpLeft,
  "slight-right": ArrowUpRight,
  straight: ArrowUp,
  uturn: RotateCcw,
  merge: Merge,
  fork: Split,
  "roundabout-left": RotateCcw,
  "roundabout-right": RotateCw,
  arrive: Flag,
  depart: Navigation,
};

const BANNER_TOP_GAP = 8;
const MANEUVER_ICON_SIZE = 40;
const THEN_ICON_SIZE = 18;

const spokenGuidance = (guidance: Guidance, distanceLabel: string | null): string =>
  [distanceLabel ? `In ${distanceLabel}` : null, guidance.headline, guidance.detail, guidance.note]
    .filter(Boolean)
    .join(", ");

export interface ManeuverBannerProps {
  guidance: Guidance;
  colors: NavigationColors;
  /** Shown under the banner: loading, rerouting, off-route. */
  statusLabel: string | null;
  /** Shown under the banner as a warning. */
  alertLabel: string | null;
  /** Screen y of the banner's bottom edge, so the map can pad around it. */
  onBottomChange: (bottom: number) => void;
}

/**
 * Turn-by-turn guidance, laid out like Google Maps: a large arrow with the
 * distance under it, the road as the headline, the instruction and Google's
 * note on their own lines, and a "Then" chip when the next maneuver follows closely.
 */
export const ManeuverBanner = memo(function ManeuverBanner({
  guidance,
  colors,
  statusLabel,
  alertLabel,
  onBottomChange,
}: ManeuverBannerProps) {
  const insets = useSafeAreaInsets();
  const top = insets.top + BANNER_TOP_GAP;
  const Icon = MANEUVER_ICONS[guidance.icon];
  const ThenIcon = guidance.thenIcon ? MANEUVER_ICONS[guidance.thenIcon] : null;
  const distanceLabel =
    guidance.distanceMeters === null ? null : formatDistance(guidance.distanceMeters);

  return (
    <View pointerEvents='box-none' style={[styles.wrapper, { top }]}>
      <View
        accessible
        accessibilityLiveRegion='polite'
        accessibilityLabel={spokenGuidance(guidance, distanceLabel)}
        onLayout={(event) => onBottomChange(Math.round(top + event.nativeEvent.layout.height))}
        style={[styles.card, { backgroundColor: colors.bannerBackground }]}
      >
        <View style={styles.iconColumn}>
          <Icon color={colors.bannerText} size={MANEUVER_ICON_SIZE} strokeWidth={2.5} />
          {distanceLabel ? (
            <Text style={[styles.distance, { color: colors.bannerText }]}>{distanceLabel}</Text>
          ) : null}
        </View>

        <View style={styles.textColumn}>
          <Text style={[styles.headline, { color: colors.bannerText }]} numberOfLines={2}>
            {guidance.headline}
          </Text>
          {guidance.detail ? (
            <Text style={[styles.detail, { color: colors.bannerMutedText }]} numberOfLines={2}>
              {guidance.detail}
            </Text>
          ) : null}
          {guidance.note ? (
            <Text style={[styles.note, { color: colors.bannerMutedText }]} numberOfLines={1}>
              {guidance.note}
            </Text>
          ) : null}
        </View>
      </View>

      {ThenIcon ? (
        <View style={[styles.thenChip, { backgroundColor: colors.bannerThenBackground }]}>
          <Text style={[styles.thenText, { color: colors.bannerText }]}>Then</Text>
          <ThenIcon color={colors.bannerText} size={THEN_ICON_SIZE} strokeWidth={2.5} />
        </View>
      ) : null}

      {statusLabel ? (
        <View style={[styles.chip, { backgroundColor: colors.chipBackground }]}>
          <Text style={[styles.chipText, { color: colors.chipText }]}>{statusLabel}</Text>
        </View>
      ) : null}

      {alertLabel ? (
        <View style={[styles.chip, { backgroundColor: colors.alertBackground }]}>
          <Text style={[styles.chipText, { color: colors.bannerText }]}>{alertLabel}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 60,
    elevation: 60,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "rgb(0, 0, 0)",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  iconColumn: {
    alignItems: "center",
    minWidth: 64,
    marginRight: 12,
  },
  distance: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
  },
  textColumn: {
    flex: 1,
  },
  headline: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
  },
  detail: {
    fontSize: 15,
    marginTop: 2,
  },
  note: {
    fontSize: 13,
    marginTop: 4,
  },
  thenChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginLeft: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  thenText: {
    fontSize: 14,
    fontWeight: "700",
    marginRight: 6,
  },
  chip: {
    alignSelf: "center",
    marginTop: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
