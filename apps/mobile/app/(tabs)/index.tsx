import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { CategoryChips } from "@/components/CategoryChips";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { getCategories, getSkillsForCategory } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function BrowseTab() {
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

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Skills Aggregator</Text>
        <Text style={styles.title}>Browse</Text>
        <Text style={styles.subtitle}>Multi-sport learning resources by category and skill.</Text>
      </View>

      {categoriesQuery.isLoading ? (
        <ActivityIndicator color={colors.court} />
      ) : (
        <View style={styles.categories}>
          <CategoryChips categories={categories} activeSlug={activeCategory?.slug} />
        </View>
      )}

      {activeCategory ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>Featured category</Text>
          <Text style={styles.sectionTitle}>{activeCategory.name}</Text>
        </View>
      ) : null}

      {skillsQuery.isLoading ? (
        <ActivityIndicator color={colors.court} style={{ marginTop: 20 }} />
      ) : (
        <FlashList
          data={skillsQuery.data?.skills ?? []}
          style={styles.list}
          estimatedItemSize={132}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No active skills found yet.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    color: colors.court,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 8,
    color: colors.graphite,
    fontSize: 16,
    lineHeight: 23,
  },
  categories: {
    marginBottom: 18,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: colors.graphite,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  sectionTitle: {
    marginTop: 4,
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
  },
  empty: {
    marginTop: 20,
    color: colors.graphite,
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
});
