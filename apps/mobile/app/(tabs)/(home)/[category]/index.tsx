import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ResourceTile } from "@/components/ResourceTile";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/SkeletonList";
import { getCategoryWithSkillResources } from "@/lib/data";
import { colors, spacing } from "@/lib/theme";

export default function CategoryScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const categorySlug = category ?? "badminton";
  const query = useQuery({
    queryKey: ["category-sections", categorySlug],
    queryFn: () => getCategoryWithSkillResources(categorySlug),
    staleTime: 180000,
  });

  const categoryData = query.data?.category ?? null;
  const sections = query.data?.sections ?? [];

  return (
    <Screen edges={["top"]} padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={colors.ink}
          />
        }
      >
        <View style={styles.headerWrap}>
          <PageHeader title={categoryData?.name ?? "Category"} showBack />
        </View>

        {query.isLoading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={2} />
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={Search}
              title="No resources yet"
              subtitle="Check back soon — the agent pulls new resources every night."
            />
          </View>
        ) : (
          sections.map((section, index) => (
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
});
