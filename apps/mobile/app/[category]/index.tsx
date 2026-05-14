import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { getSkillsForCategory } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function CategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const categorySlug = category ?? "badminton";
  const [showAllSkills, setShowAllSkills] = useState(false);
  const query = useQuery({
    queryKey: ["category", categorySlug, "skills"],
    queryFn: () => getSkillsForCategory(categorySlug),
    staleTime: 300000,
  });
  const skills = query.data?.skills ?? [];
  const visibleSkills = showAllSkills ? skills : skills.filter((skill) => skill.resource_count > 0);
  const hiddenEmptyCount = skills.length - visibleSkills.length;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Category</Text>
        <Text style={styles.title}>{query.data?.category?.name ?? "Category"}</Text>
        {query.data?.category?.description ? (
          <Text style={styles.subtitle}>{query.data.category.description}</Text>
        ) : null}
      </View>

      {hiddenEmptyCount > 0 ? (
        <Pressable
          onPress={() => setShowAllSkills((current) => !current)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Text style={styles.toggleText}>
            {showAllSkills ? "Hide empty skills" : `Show all skills (${hiddenEmptyCount} empty)`}
          </Text>
        </Pressable>
      ) : null}

      {query.isLoading ? (
        <ActivityIndicator color={colors.court} style={{ marginTop: 20 }} />
      ) : (
        <FlashList
          data={visibleSkills}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No skills with resources yet.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} />}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 14,
  },
  eyebrow: {
    color: colors.court,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 8,
    color: colors.graphite,
    fontSize: 15,
    lineHeight: 22,
  },
  toggle: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.72,
  },
  toggleText: {
    color: colors.courtDark,
    fontSize: 13,
    fontWeight: "800",
  },
  empty: {
    marginTop: 20,
    color: colors.graphite,
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
});
