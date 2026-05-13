import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { LevelFilter, type LevelFilterValue } from "@/components/LevelFilter";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { getSkillsForCategory } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function CategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const categorySlug = category ?? "badminton";
  const [level, setLevel] = useState<LevelFilterValue>("all");
  const query = useQuery({
    queryKey: ["category", categorySlug, "skills"],
    queryFn: () => getSkillsForCategory(categorySlug),
    staleTime: 300000,
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Category</Text>
        <Text style={styles.title}>{query.data?.category?.name ?? "Category"}</Text>
        {query.data?.category?.description ? (
          <Text style={styles.subtitle}>{query.data.category.description}</Text>
        ) : null}
      </View>

      <View style={styles.filterWrap}>
        <Text style={styles.filterLabel}>Open skill resources at level</Text>
        <LevelFilter value={level} onChange={setLevel} />
      </View>

      {query.isLoading ? (
        <ActivityIndicator color={colors.court} style={{ marginTop: 20 }} />
      ) : (
        <FlashList
          data={query.data?.skills ?? []}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No active skills found for this category.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} level={level} />}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 24 }}
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
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 8,
    color: colors.graphite,
    fontSize: 15,
    lineHeight: 22,
  },
  filterWrap: {
    gap: 8,
  },
  filterLabel: {
    color: colors.graphite,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
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
