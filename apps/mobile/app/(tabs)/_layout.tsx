import { Tabs } from "expo-router";
import { BookOpen, Compass, UserRound } from "lucide-react-native";
import { colors } from "@/lib/theme";

/**
 * Two-tab root.
 *  Each tab is a route group containing its own Stack so we can push
 *  Category and Skill screens while the tab bar stays visible.
 */

/**
 * The tab BAR order comes from the <Tabs.Screen> order below, but the tab the app
 * OPENS on comes from the filesystem route order, which is alphabetical — so
 * `(account)` silently became the launch tab when it was added. Pin the launch tab
 * to Discover explicitly.
 */
export const unstable_settings = {
  initialRouteName: "(home)",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarStyle: {
          borderTopColor: colors.divider,
          backgroundColor: colors.surface,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(library)"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(account)"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
