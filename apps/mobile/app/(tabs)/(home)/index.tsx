import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SearchBar } from "@/components/SearchBar";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/SkeletonList";
import { SkillTile } from "@/components/SkillTile";
import { getDiscoverSections } from "@/lib/data";
import { colors, spacing } from "@/lib/theme";

export default function DiscoverTab() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["discover-sections"],
    queryFn: () => getDiscoverSections(),
    staleTime: 300000,
  });

  const sections = query.data ?? [];

  const visibleSections = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sections;
    return sections
      .map((section) => {
        const matchedCategory = section.category.name.toLowerCase().includes(needle);
        if (matchedCategory) return section;
        const matchedSkills = section.skills.filter((tile) =>
          tile.skill.name.toLowerCase().includes(needle),
        );
        return matchedSkills.length ? { ...section, skills: matchedSkills } : null;
      })
      .filter((section): section is NonNullable<typeof section> => section !== null);
  }, [search, sections]);

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
          <PageHeader title="Discover" />
          <View style={styles.searchWrap}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search discipline" />
          </View>
        </View>

        {query.isLoading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={3} />
          </View>
        ) : (
          visibleSections.map((section, index) => (
            <View
              key={section.category.id}
              style={[styles.section, index === 0 ? styles.firstSection : null]}
            >
              <SectionHeader
                title={section.category.name}
                onPress={() => router.push(`/${section.category.slug}`)}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalRow}
              >
                {section.skills.map((tile) => (
                  <SkillTile
                    key={tile.skill.id}
                    skill={tile.skill}
                    thumbnailUrl={tile.latest_thumbnail}
                  />
                ))}
              </ScrollView>
              <View style={styles.divider} />
            </View>
          ))
        )}
      </ScrollView>
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
  },
  searchWrap: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
    paddingTop: spacing.md,
  },
});
