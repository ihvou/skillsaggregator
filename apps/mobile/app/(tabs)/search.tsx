import { useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SearchBar } from "@/components/SearchBar";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getAllSkills } from "@/lib/data";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

export default function SearchTab() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["all-skills"],
    queryFn: getAllSkills,
    staleTime: 300000,
  });
  const results = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const skills = query.data ?? [];
    if (!needle) return skills.filter((skill) => skill.resource_count > 0);
    return skills.filter((skill) =>
      `${skill.name} ${skill.description ?? ""} ${skill.category_slug}`.toLowerCase().includes(needle),
    );
  }, [query.data, search]);

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader title="Search" subtitle="All skills" showMenu />
        <View style={styles.searchWrap}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search all skills" />
        </View>
      </View>
      {query.isLoading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlashList
          data={results}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={Search}
                title={search.trim() ? "No matching skills" : "Search the skill library"}
                subtitle={search.trim() ? "Try a broader term or another sport." : "Type a movement, technique, or training goal."}
              />
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Link href={`/${item.category_slug}/${item.slug}` as any} asChild>
              <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.category_slug} · {item.resource_count} {item.resource_count === 1 ? "resource" : "resources"}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.faint} />
              </Pressable>
            </Link>
          )}
          contentContainerStyle={styles.listContent}
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
  searchWrap: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.thumbnail,
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.rowTitle,
    fontSize: 15,
  },
  meta: {
    ...typography.meta,
    fontSize: 12,
    textTransform: "capitalize",
  },
  divider: {
    height: spacing.xs,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.page,
  },
  emptyWrap: {
    paddingHorizontal: spacing.page,
  },
});
