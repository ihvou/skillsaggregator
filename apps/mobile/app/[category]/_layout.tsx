import { Stack } from "expo-router";
import { colors } from "@/lib/theme";

export default function CategoryStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.shuttle },
        headerTintColor: colors.courtDark,
        headerTitleStyle: {
          color: colors.ink,
          fontWeight: "800",
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Category" }} />
      <Stack.Screen name="[skill]/index" options={{ title: "Skill" }} />
    </Stack>
  );
}
