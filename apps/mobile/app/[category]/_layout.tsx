import { Pressable, StyleSheet, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/lib/theme";

function BackPressable() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      style={styles.backButton}
      hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <ChevronLeft size={24} color={colors.ink} />
      <Text style={styles.backLabel}>Back</Text>
    </Pressable>
  );
}

export default function CategoryStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: colors.shuttle },
        headerTintColor: colors.ink,
        headerTitleStyle: {
          color: colors.ink,
          fontWeight: "700",
          fontSize: 17,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "",
          headerLeft: () => <BackPressable />,
        }}
      />
      <Stack.Screen
        name="[skill]/index"
        options={{
          title: "",
          headerLeft: () => <BackPressable />,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 10,
  },
  backLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "600",
  },
});
