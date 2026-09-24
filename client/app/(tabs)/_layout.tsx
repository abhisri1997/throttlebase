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
import { useTheme } from "../../src/theme/ThemeContext";

/**
 * expo-router types `tabBarIcon`'s color as RN's ColorValue, which widens to
 * OpaqueColorValue (PlatformColor). Lucide icons take a plain string, and the
 * theme only ever supplies string colours, so the narrowing happens once here
 * rather than as a cast at every tab.
 */
const tabIcon =
  (Icon: ComponentType<{ size?: number; color?: string }>) =>
  ({ color }: { color: ColorValue }) => <Icon size={24} color={color as string} />;

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
    title: "Groups",
    tabBarIcon: tabIcon(Users)
  },
  {
    name: "rewards",
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
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
          }}
        />
      ))}
    </Tabs>
  );
}
