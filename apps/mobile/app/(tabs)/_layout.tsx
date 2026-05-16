import { Tabs } from "expo-router";
import { Bookmark, Compass } from "lucide-react-native";
import { colors } from "@/lib/theme";

/**
 * Two-tab root.
 *  Each tab is a route group containing its own Stack so we can push
 *  Category and Skill screens while the tab bar stays visible.
 */
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
          title: "Saved",
          tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
