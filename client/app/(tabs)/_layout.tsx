import { Tabs } from "expo-router";
import {
  Compass,
  Map,
  Activity,
  User,
  Trophy,
  Users,
} from "lucide-react-native";
import { useTheme } from "../../src/theme/ThemeContext";
import { size } from "zod";

const TABS_DETAILS = [
  { name: "feed",
    title: "Feed",
    tabBarIcon: ({ color }: { color: string }) => <Activity size={24} color={color} />
  },
  {
    name: "rides",
    title: "Discover",
    tabBarIcon: ({ color }: { color: string }) => <Compass size={24} color={color} />
  },
  {
    name: "routes",
    title: "Routes",
    tabBarIcon: ({ color }: { color: string }) => <Map size={24} color={color} />
  },
  {
    name: "groups",
    title: "Groups",
    tabBarIcon: ({ color }: { color: string }) => <Users size={24} color={color} />
  },
  {
    name: "rewards",
    title: "Rank",
    tabBarIcon: ({ color }: { color: string }) => <Trophy size={24} color={color} />
  },
  {
    name: "profile",
    title: "Profile",
    tabBarIcon: ({ color }: { color: string }) => <User size={24} color={color} />
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
