import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { CategoryChips } from "@/components/CategoryChips";
import { EmptyState } from "@/components/EmptyState";
import { SearchBar } from "@/components/SearchBar";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { SkeletonList } from "@/components/SkeletonList";
import { getCategories, getSkillsForCategory } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function BrowseTab() {
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [search, setSearch] = useState("");
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
  const searchedSkills = search.trim()
    ? skills.filter((skill) => {
        const needle = search.trim().toLowerCase();
        return `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(needle);
      })
    : skills;
  const visibleSkills = showAllSkills ? searchedSkills : searchedSkills.filter((skill) => skill.resource_count > 0);
  const hiddenEmptyCount = searchedSkills.length - visibleSkills.length;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Multi-sport learning resources by category and skill.</Text>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} />
      </View>

      {categoriesQuery.isLoading ? (
        <View style={styles.categorySkeletons}>
          <View style={[styles.categorySkeleton, styles.categorySkeletonSmall]} />
          <View style={[styles.categorySkeleton, styles.categorySkeletonLarge]} />
          <View style={[styles.categorySkeleton, styles.categorySkeletonMedium]} />
        </View>
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
        <SkeletonList />
      ) : (
        <FlashList
          data={visibleSkills}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon={Search}
              title={search.trim() ? "No matching skills" : "No skills with resources yet"}
              subtitle={search.trim() ? "Try a broader search term or switch category." : "Use Show all skills to browse the full taxonomy."}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} />}
          refreshControl={
            <RefreshControl
              refreshing={categoriesQuery.isRefetching || skillsQuery.isRefetching}
              onRefresh={() => {
                categoriesQuery.refetch();
                skillsQuery.refetch();
              }}
              tintColor={colors.court}
            />
          }
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
  title: {
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
  categorySkeletons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  categorySkeleton: {
    height: 38,
    borderRadius: 8,
    backgroundColor: "rgba(16,32,38,0.09)",
  },
  categorySkeletonSmall: {
    width: 72,
  },
  categorySkeletonMedium: {
    width: 84,
  },
  categorySkeletonLarge: {
    width: 96,
  },
  searchWrap: {
    marginBottom: 14,
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
  list: {
    flex: 1,
  },
});
