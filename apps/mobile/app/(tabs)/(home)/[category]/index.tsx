import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  buildLearningPathIndex,
  buildSkillResourceSections,
  filterLearningPathStages,
  type ResourceSort,
  type ResourceSourceFilter,
} from "@skillsaggregator/shared";
import { PlusCircle, Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import type { LevelFilterValue } from "@/components/LevelFilter";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceTile } from "@/components/ResourceTile";
import { Screen } from "@/components/Screen";
import { SearchBar } from "@/components/SearchBar";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/SkeletonList";
import { SortFilterSheet } from "@/components/SortFilterSheet";
import { getCategoryWithSkillResources } from "@/lib/data";
import { colors, radius, spacing, typography } from "@/lib/theme";

type CategoryTab = "subskills" | "path";

export default function CategoryScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const categorySlug = category ?? "badminton";
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<CategoryTab>("subskills");
  const [level, setLevel] = useState<LevelFilterValue>("all");
  const [sort, setSort] = useState<ResourceSort>("popular");
  const [source, setSource] = useState<ResourceSourceFilter>("all");
  const [menuVisible, setMenuVisible] = useState(false);
  const query = useQuery({
    queryKey: ["category-sections", categorySlug],
    queryFn: () => getCategoryWithSkillResources(categorySlug),
    staleTime: 180000,
  });

  const categoryData = query.data?.category ?? null;
  const skills = query.data?.skills ?? [];
  const resources = query.data?.resources ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    return buildSkillResourceSections(skills, resources, {
      query: normalizedSearch,
      level,
      source,
      sort,
      perSkill: 8,
    });
  }, [level, normalizedSearch, resources, skills, sort, source]);

  const learningPathIndex = useMemo(
    () => buildLearningPathIndex(skills, resources),
    [resources, skills],
  );

  const learningPathStages = useMemo(() => {
    return filterLearningPathStages(learningPathIndex, {
      query: normalizedSearch,
      level,
      source,
      perSkill: 3,
    });
  }, [learningPathIndex, level, normalizedSearch, source]);

  return (
    <Screen edges={["top"]} padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={colors.ink}
          />
        }
      >
        <View style={styles.headerWrap}>
          <PageHeader
            title={categoryData?.name ?? "Category"}
            showBack
            showMenu
            onMenuPress={() => setMenuVisible(true)}
            rightAccessory={
              <Pressable
                onPress={() => router.push({ pathname: "/suggest", params: { category: categorySlug } })}
                style={({ pressed }) => [styles.suggestButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Suggest a link"
              >
                <PlusCircle size={18} color={colors.surface} />
                <Text style={styles.suggestButtonText}>Suggest</Text>
              </Pressable>
            }
          />
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search sub-skills"
          />
          <View style={styles.tabs}>
            {[
              { value: "subskills" as const, label: "Sub-skills" },
              { value: "path" as const, label: "Learning Path" },
            ].map((item) => {
              const selected = tab === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setTab(item.value)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    selected && styles.tabButtonSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {query.isLoading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={2} />
          </View>
        ) : tab === "subskills" ? (
          visibleSections.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={Search}
                title="No matching sub-skills"
                subtitle="Try another search, level, or source."
              />
            </View>
          ) : (
            visibleSections.map((section, index) => (
              <View
                key={section.skill.id}
                style={[styles.section, index === 0 ? styles.firstSection : null]}
              >
                <SectionHeader
                  title={section.skill.name}
                  onPress={() => router.push(`/${categorySlug}/${section.skill.slug}`)}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalRow}
                >
                  {section.resources.map((resource) => (
                    <ResourceTile key={resource.id} resource={resource} />
                  ))}
                </ScrollView>
                <View style={styles.divider} />
              </View>
            ))
          )
        ) : (
          <View style={styles.pathWrap}>
            {learningPathStages.map((stage) => (
              <View key={stage.value} style={styles.pathStage}>
                <View style={styles.pathStageHeader}>
                  <Text style={styles.pathStageTitle}>{stage.label}</Text>
                  <Text style={styles.pathStageMeta}>
                    {stage.entries.length} {stage.entries.length === 1 ? "sub-skill" : "sub-skills"}
                  </Text>
                </View>
                {stage.entries.length === 0 ? (
                  <Text style={styles.pathEmpty}>No matching resources in this stage yet.</Text>
                ) : (
                  stage.entries.map((entry) => (
                    <View key={`${stage.value}-${entry.skill.id}`} style={styles.pathSkill}>
                      <SectionHeader
                        title={entry.skill.name}
                        onPress={() => router.push(`/${categorySlug}/${entry.skill.slug}`)}
                      />
                      <Text style={styles.pathSkillMeta}>
                        {entry.total} {entry.total === 1 ? "resource" : "resources"}
                      </Text>
                      <View style={styles.pathResources}>
                        {entry.resources.map((resource, resourceIndex) => (
                          <View key={resource.id}>
                            {resourceIndex > 0 ? <View style={styles.divider} /> : null}
                            <View style={styles.pathResourceRow}>
                              <ResourceCard resource={resource} />
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <SortFilterSheet
        visible={menuVisible}
        sort={sort}
        level={level}
        source={source}
        onChangeSort={setSort}
        onChangeLevel={setLevel}
        onChangeSource={setSource}
        onClose={() => setMenuVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxl,
  },
  headerWrap: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  tabs: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  tabButton: {
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  tabButtonSelected: {
    backgroundColor: colors.ink,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  tabLabelSelected: {
    color: colors.surface,
  },
  firstSection: {
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
  },
  horizontalRow: {
    paddingHorizontal: spacing.page,
    gap: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    marginHorizontal: spacing.page,
    backgroundColor: colors.divider,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.page,
  },
  emptyWrap: {
    paddingHorizontal: spacing.page,
  },
  suggestButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  suggestButtonText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "800",
  },
  pathWrap: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.page,
    gap: spacing.xl,
  },
  pathStage: {
    gap: spacing.md,
  },
  pathStageHeader: {
    gap: 2,
  },
  pathStageTitle: {
    ...typography.sectionTitle,
    fontSize: 24,
  },
  pathStageMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  pathEmpty: {
    color: colors.muted,
    fontSize: 14,
  },
  pathSkill: {
    gap: spacing.xs,
  },
  pathSkillMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  pathResources: {
    marginTop: spacing.xs,
  },
  pathResourceRow: {
    paddingVertical: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
