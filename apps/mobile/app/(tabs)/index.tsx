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

      {activeCategory && hiddenEmptyCount > 0 ? (
        <Pressable
          onPress={() => setShowAllSkills((current) => !current)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Text style={styles.toggleText}>
            {showAllSkills ? "Hide empty skills" : `Show all skills (${hiddenEmptyCount} empty)`}
          </Text>
        </Pressable>
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
    marginBottom: 14,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  categories: {
    marginBottom: 14,
  },
  categorySkeletons: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
  },
  categorySkeleton: {
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(16,32,38,0.06)",
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
    marginBottom: 12,
  },
  toggle: {
    alignSelf: "flex-start",
    minHeight: 32,
    marginBottom: 12,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: colors.tint,
  },
  pressed: {
    opacity: 0.7,
  },
  toggleText: {
    color: colors.court,
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
});
