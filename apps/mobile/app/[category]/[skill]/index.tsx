import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type { ResourceSort, SkillResource } from "@skillsaggregator/shared";
import { Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import type { LevelFilterValue } from "@/components/LevelFilter";
import { ResourceCard } from "@/components/ResourceCard";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getSkillResources } from "@/lib/data";
import { setLastSeenSkill } from "@/lib/localState";
import { colors } from "@/lib/theme";

const levels: LevelFilterValue[] = ["all", "beginner", "intermediate", "advanced"];
const sorts: Array<{ value: ResourceSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
];

export default function SkillDetailScreen() {
  const { category, skill, level: initialLevel } = useLocalSearchParams<{
    category: string;
    skill: string;
    level?: LevelFilterValue;
  }>();
  const categorySlug = category ?? "badminton";
  const skillSlug = skill ?? "forehand-smash";
  const [level, setLevel] = useState<LevelFilterValue>(
    initialLevel === "beginner" || initialLevel === "intermediate" || initialLevel === "advanced"
      ? initialLevel
      : "all",
  );
  const [sort, setSort] = useState<ResourceSort>("popular");
  const query = useQuery({
    queryKey: ["skill", categorySlug, skillSlug, sort],
    queryFn: async () => {
      const data = await getSkillResources(categorySlug, skillSlug, sort);
      if (data.skill) setLastSeenSkill(data.skill.id);
      return data;
    },
    staleTime: 120000,
  });

  const resources = useMemo(() => {
    const items = query.data?.resources ?? [];
    return level === "all" ? items : items.filter((item) => item.skill_level === level);
  }, [level, query.data?.resources]);

  return (
    <Screen>
      <Stack.Screen options={{ title: query.data?.skill?.name ?? "" }} />
      <View style={styles.header}>
        <Text style={styles.title}>{query.data?.skill?.name ?? "Skill"}</Text>
        {query.data?.category ? (
          <Text style={styles.categoryName}>{query.data.category.name}</Text>
        ) : null}
        {query.data?.skill?.description ? (
          <Text style={styles.subtitle}>{query.data.skill.description}</Text>
        ) : null}
      </View>
      {query.isLoading ? (
        <SkeletonList />
      ) : (
        <FlashList<SkillResource>
          data={resources}
          style={styles.list}
          estimatedItemSize={140}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.filterBarWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterBar}
              >
                {levels.map((option) => {
                  const selected = level === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setLevel(option)}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {option === "all" ? "All" : option}
                      </Text>
                    </Pressable>
                  );
                })}
                <View style={styles.filterDivider} />
                {sorts.map((option) => {
                  const selected = sort === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setSort(option.value)}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
          stickyHeaderIndices={[0]}
          ListEmptyComponent={
            <EmptyState
              icon={Search}
              title="No matches for this level"
              subtitle="Try All, switch the sort, or check back after moderation."
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <ResourceCard resource={item} />}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
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
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  categoryName: {
    marginTop: 4,
    color: colors.court,
    fontSize: 13,
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  filterBarWrap: {
    marginBottom: 12,
    backgroundColor: colors.shuttle,
  },
  filterBar: {
    alignItems: "center",
    gap: 6,
    paddingBottom: 2,
  },
  filterChip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: colors.ink,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  filterChipTextActive: {
    color: colors.white,
    fontWeight: "700",
  },
  filterDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 4,
    backgroundColor: colors.line,
  },
  list: {
    flex: 1,
  },
});
