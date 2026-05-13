import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type { SkillResource } from "@skillsaggregator/shared";
import { LevelFilter, type LevelFilterValue } from "@/components/LevelFilter";
import { ResourceCard } from "@/components/ResourceCard";
import { Screen } from "@/components/Screen";
import { getSkillResources } from "@/lib/data";
import { setLastSeenSkill } from "@/lib/localState";
import { colors } from "@/lib/theme";

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
  const query = useQuery({
    queryKey: ["skill", categorySlug, skillSlug],
    queryFn: async () => {
      const data = await getSkillResources(categorySlug, skillSlug);
      if (data.skill) setLastSeenSkill(data.skill.id);
      return data;
    },
    staleTime: 120000,
  });

  const resources = useMemo(() => {
    const items = query.data?.resources ?? [];
    return level === "all" ? items : items.filter((item) => item.skill_level === level);
  }, [level, query.data?.resources]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Skill detail</Text>
        <Text style={styles.title}>{query.data?.skill?.name ?? "Skill"}</Text>
        {query.data?.category ? (
          <Text style={styles.categoryName}>{query.data.category.name}</Text>
        ) : null}
        {query.data?.skill?.description ? (
          <Text style={styles.subtitle}>{query.data.skill.description}</Text>
        ) : null}
      </View>
      <LevelFilter value={level} onChange={setLevel} />
      {query.isLoading ? (
        <ActivityIndicator color={colors.court} style={{ marginTop: 20 }} />
      ) : (
        <FlashList<SkillResource>
          data={resources}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>No approved resources match this filter yet.</Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <ResourceCard resource={item} />}
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
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 8,
    color: colors.graphite,
    fontSize: 15,
    lineHeight: 22,
  },
  categoryName: {
    marginTop: 6,
    color: colors.court,
    fontSize: 13,
    fontWeight: "800",
  },
  empty: {
    marginTop: 20,
    color: colors.graphite,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    flex: 1,
  },
});
