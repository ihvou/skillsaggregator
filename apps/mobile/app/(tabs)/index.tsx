import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { CategoryTile } from "@/components/CategoryTile";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/SkeletonList";
import { getCategoriesWithPreviews } from "@/lib/data";
import { colors, spacing } from "@/lib/theme";

export default function DiscoverTab() {
  const query = useQuery({
    queryKey: ["categories-with-previews"],
    queryFn: getCategoriesWithPreviews,
    staleTime: 300000,
  });
  const categories = query.data ?? [];

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
          <PageHeader title="Discover" subtitle="Categories" showMenu />
        </View>

        <SectionHeader title="Top Categories" subtitle="Updated regularly" showChevron={false} />
        {query.isLoading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={2} />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalRow}
          >
            {categories.map((category) => (
              <CategoryTile key={category.id} category={category} size="lg" />
            ))}
          </ScrollView>
        )}

        <View style={styles.spacer} />

        <SectionHeader title="Browse All" showChevron={false} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalRow}
        >
          {categories.map((category) => (
            <CategoryTile key={`md-${category.id}`} category={category} size="md" />
          ))}
        </ScrollView>
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
  horizontalRow: {
    paddingHorizontal: spacing.page,
    gap: spacing.md,
  },
  spacer: {
    height: spacing.xl,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.page,
  },
});
