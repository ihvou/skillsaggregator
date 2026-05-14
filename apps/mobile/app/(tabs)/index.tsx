import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { CategoryChips } from "@/components/CategoryChips";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { getCategories, getSkillsForCategory } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function BrowseTab() {
  const [showAllSkills, setShowAllSkills] = useState(false);
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 300000,
  });
  const categories = categoriesQuery.data ?? [];
  const activeCategory = categories[0] ?? null;
  const skillsQuery = useQuery({
    queryKey: ["skills", activeCategory?.slug],
    queryFn: () => getSkillsForCategory(activeCategory?.slug ?? "badminton"),
    enabled: Boolean(activeCategory),
    staleTime: 300000,
  });
  const skills = skillsQuery.data?.skills ?? [];
  const visibleSkills = showAllSkills ? skills : skills.filter((skill) => skill.resource_count > 0);
  const hiddenEmptyCount = skills.length - visibleSkills.length;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Skills Aggregator</Text>
        <Text style={styles.title}>Browse</Text>
        <Text style={styles.subtitle}>Multi-sport learning resources by category and skill.</Text>
      </View>

      {categoriesQuery.isLoading ? (
        <ActivityIndicator color={colors.court} />
      ) : (
        <View style={styles.categories}>
          <CategoryChips categories={categories} activeSlug={activeCategory?.slug} />
        </View>
      )}

      {activeCategory ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{activeCategory.name}</Text>
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
        </View>
      ) : null}

      {skillsQuery.isLoading ? (
        <ActivityIndicator color={colors.court} style={{ marginTop: 20 }} />
      ) : (
        <FlashList
          data={visibleSkills}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No skills with resources yet.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
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
    fontSize: 34,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 8,
    color: colors.graphite,
    fontSize: 16,
    lineHeight: 23,
  },
  categories: {
    marginBottom: 18,
  },
  sectionHeader: {
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
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
