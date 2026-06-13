import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  resourceMatchesSource,
  resourceValueScore,
  type ResourceSort,
  type ResourceSourceFilter,
  type SkillLevel,
  type SkillResource,
  type SkillSummary,
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
import type { SkillSection } from "@/lib/data";
import { getCategoryWithSkillResources } from "@/lib/data";
import { colors, radius, spacing, typography } from "@/lib/theme";

type CategoryTab = "subskills" | "path";

const LEVELS: Array<{ value: SkillLevel; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

function matches(value: string | null | undefined, query: string) {
  return value?.toLowerCase().includes(query) ?? false;
}

function sortTime(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortResources(resources: SkillResource[], sort: ResourceSort) {
  return [...resources].sort((a, b) =>
    sort === "popular"
      ? resourceValueScore(b) - resourceValueScore(a)
      : sortTime(b.created_at) - sortTime(a.created_at),
  );
}

function sortLearningPathResources(resources: SkillResource[]) {
  return [...resources].sort((a, b) => {
    const score = resourceValueScore(b) - resourceValueScore(a);
    return score !== 0 ? score : sortTime(b.created_at) - sortTime(a.created_at);
  });
}

function levelValue(level: LevelFilterValue): SkillLevel | null {
  return level === "all" ? null : level;
}

function resourcePassesFilters(
  resource: SkillResource,
  level: SkillLevel | null,
  source: ResourceSourceFilter,
) {
  const levelMatched = !level || resource.skill_level === level;
  return levelMatched && resourceMatchesSource(resource, source);
}

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
  const sections = query.data?.sections ?? [];
  const resources = query.data?.resources ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const selectedLevel = levelValue(level);

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => {
        const skillMatched =
          !normalizedSearch ||
          matches(section.skill.name, normalizedSearch) ||
          matches(section.skill.description, normalizedSearch);
        if (!skillMatched) return null;
        const filteredResources = sortResources(
          section.resources.filter((resource) =>
            resourcePassesFilters(resource, selectedLevel, source),
          ),
          sort,
        );
        return filteredResources.length ? { ...section, resources: filteredResources } : null;
      })
      .filter((section): section is SkillSection => Boolean(section));
  }, [normalizedSearch, sections, selectedLevel, sort, source]);

  const learningPathStages = useMemo(() => {
    const skillById = new Map(
      sections.map((section) => [section.skill.id, section.skill]),
    );
    const allowedLevels = selectedLevel
      ? LEVELS.filter((item) => item.value === selectedLevel)
      : LEVELS;

    return allowedLevels.map((levelItem) => {
      const resourcesBySkill = new Map<string, SkillResource[]>();
      for (const resource of resources) {
        const skillId = resource.skill?.id;
        if (!skillId || resource.skill_level !== levelItem.value) continue;
        const skill = skillById.get(skillId);
        if (!skill) continue;
        const skillMatched =
          !normalizedSearch ||
          matches(skill.name, normalizedSearch) ||
          matches(skill.description, normalizedSearch);
        if (!skillMatched || !resourceMatchesSource(resource, source)) continue;
        const bucket = resourcesBySkill.get(skillId) ?? [];
        bucket.push(resource);
        resourcesBySkill.set(skillId, bucket);
      }

      const entries = [...resourcesBySkill.entries()]
        .map(([skillId, bucket]) => {
          const skill = skillById.get(skillId);
          if (!skill) return null;
          return {
            skill,
            total: bucket.length,
            resources: sortLearningPathResources(bucket).slice(0, 3),
          };
        })
        .filter((entry): entry is { skill: SkillSummary; total: number; resources: SkillResource[] } =>
          Boolean(entry),
        )
        .sort((a, b) => b.total - a.total || a.skill.name.localeCompare(b.skill.name));

      return { ...levelItem, entries };
    });
  }, [normalizedSearch, resources, sections, selectedLevel, source]);

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
