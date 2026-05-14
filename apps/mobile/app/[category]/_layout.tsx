import { Pressable, StyleSheet, Text } from "react-native";
import { Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { colors } from "@/lib/theme";

export default function CategoryStackLayout() {
  const router = useRouter();

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
      <Stack.Screen
        name="index"
        options={{
          title: "Category",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={22} color={colors.courtDark} />
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="[skill]/index" options={{ title: "Skill" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 10,
  },
  backLabel: {
    color: colors.courtDark,
    fontSize: 16,
    fontWeight: "700",
  },
});
