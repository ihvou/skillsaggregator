import { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, RefreshControl, StyleSheet, View } from "react-native";
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
import { getSkillResources } from "@/lib/data";
import { setLastSeenSkill } from "@/lib/localState";
import { colors, spacing } from "@/lib/theme";

const SORTS: Array<{ value: ResourceSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
];
const LEVELS: Array<{ value: LevelFilterValue; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
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

  const openSortSheet = useCallback(() => {
    const labels = SORTS.map((option) => (option.value === sort ? `${option.label}  ✓` : option.label));
    const options = [...labels, "Cancel"];
    const cancelIndex = options.length - 1;
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: cancelIndex, title: "Sort" },
      (selected) => {
        if (selected === undefined || selected === cancelIndex) return;
        const next = SORTS[selected];
        if (next) setSort(next.value);
      },
    );
  }, [sort]);

  const openLevelSheet = useCallback(() => {
    const labels = LEVELS.map((option) => (option.value === level ? `${option.label}  ✓` : option.label));
    const options = [...labels, "Cancel"];
    const cancelIndex = options.length - 1;
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: cancelIndex, title: "Filter by level" },
      (selected) => {
        if (selected === undefined || selected === cancelIndex) return;
        const next = LEVELS[selected];
        if (next) setLevel(next.value);
      },
    );
  }, [level]);

  const handleMenuPress = useCallback(() => {
    if (Platform.OS !== "ios") {
      // Minimal Android fallback — Apple-style action sheets aren't available.
      Alert.alert("Options", "Choose a section", [
        { text: "Sort", onPress: openSortSheet },
        { text: "Filter by level", onPress: openLevelSheet },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    const options = ["Sort", "Filter by level", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 2 },
      (selected) => {
        if (selected === 0) openSortSheet();
        if (selected === 1) openLevelSheet();
      },
    );
  }, [openSortSheet, openLevelSheet]);

  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    parts.push(SORTS.find((option) => option.value === sort)?.label ?? "Popular");
    if (level !== "all") parts.push(LEVELS.find((option) => option.value === level)?.label ?? "");
    return parts.filter(Boolean).join(" · ");
  }, [sort, level]);

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader
          title={query.data?.skill?.name ?? "Skill"}
          subtitle={headerSubtitle}
          showBack
          showMenu
          onMenuPress={handleMenuPress}
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
