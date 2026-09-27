import { Tabs } from "expo-router";
import {
  Compass,
  Map,
  Activity,
  User,
  Trophy,
  Users,
} from "lucide-react-native";
import type { ComponentType } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { FEATURES } from "../../src/core/features/features";

/**
 * expo-router types `tabBarIcon`'s color as RN's ColorValue, which widens to
 * OpaqueColorValue (PlatformColor). Lucide icons take a plain string, and the
 * theme only ever supplies string colours, so the narrowing happens once here
 * rather than as a cast at every tab.
 */
const tabIcon =
  (Icon: ComponentType<{ size?: number; color?: string }>) =>
  ({ color }: { color: ColorValue }) => <Icon size={24} color={color as string} />;

const TAB_BAR_HEIGHT = 60;
const TAB_BAR_PADDING = 8;

const TABS_DETAILS = [
  { name: "feed",
    title: "Feed",
    tabBarIcon: tabIcon(Activity)
  },
  {
    name: "rides",
    title: "Discover",
    tabBarIcon: tabIcon(Compass)
  },
  {
    name: "routes",
    title: "Routes",
    tabBarIcon: tabIcon(Map)
  },
  {
    name: "groups",
    isEnabled: FEATURES.groups,
    title: "Groups",
    tabBarIcon: tabIcon(Users)
  },
  {
    name: "rewards",
    isEnabled: FEATURES.rank,
    title: "Rank",
    tabBarIcon: tabIcon(Trophy)
  },
  {
    name: "profile",
    title: "Profile",
    tabBarIcon: tabIcon(User)
  },
]

export default function TabLayout() {
  const { colors } = useTheme();
  // Android draws edge to edge, so the gesture bar sits over the app; the
  // tab bar grows by the inset instead of letting it cover the labels.
  const { bottom: bottomInset } = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: TAB_BAR_PADDING + bottomInset,
          paddingTop: TAB_BAR_PADDING,
          height: TAB_BAR_HEIGHT + bottomInset,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
      }}
    >
      {TABS_DETAILS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: tab.tabBarIcon,
            // A held-back tab stays declared, or expo-router would add its
            // file back as a visible tab; href null hides it instead.
            ...(tab.isEnabled === false ? { href: null } : {}),
          }}
        />
      ))}
    </Tabs>
  );
}
