import { useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type { ResourceSort, SkillResource } from "@skillsaggregator/shared";
import { Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import type { LevelFilterValue } from "@/components/LevelFilter";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { SortFilterSheet } from "@/components/SortFilterSheet";
import { getSkillResources } from "@/lib/data";
import { setLastSeenSkill } from "@/lib/localState";
import { colors, spacing } from "@/lib/theme";

const SORT_LABELS: Record<ResourceSort, string> = {
  popular: "Popular",
  newest: "Newest",
};
const LEVEL_LABELS: Record<LevelFilterValue, string> = {
  all: "All levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

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
  const [menuVisible, setMenuVisible] = useState(false);

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

  const headerSubtitle = useMemo(() => {
    const parts: string[] = [SORT_LABELS[sort]];
    if (level !== "all") parts.push(LEVEL_LABELS[level]);
    return parts.join(" · ");
  }, [sort, level]);

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader
          title={query.data?.skill?.name ?? "Skill"}
          subtitle={headerSubtitle}
          showBack
          showMenu
          onMenuPress={() => setMenuVisible(true)}
        />
      </View>
      {query.isLoading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <FlashList<SkillResource>
          data={resources}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={Search}
                title="No matches for this filter"
                subtitle="Open the menu (…) to change sort or level."
              />
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            <View style={styles.rowWrap}>
              <ResourceCard resource={item} />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={colors.ink}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      <SortFilterSheet
        visible={menuVisible}
        sort={sort}
        level={level}
        onChangeSort={setSort}
        onChangeLevel={setLevel}
        onClose={() => setMenuVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
  },
  list: {
    flex: 1,
  },
  rowWrap: {
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.page,
    backgroundColor: colors.divider,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
  },
  emptyWrap: {
    paddingHorizontal: spacing.page,
  },
});
