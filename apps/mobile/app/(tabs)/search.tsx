import { useMemo, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SearchBar } from "@/components/SearchBar";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { SkeletonList } from "@/components/SkeletonList";
import { getAllSkills } from "@/lib/data";
import { colors } from "@/lib/theme";

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
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Find a skill across every sport and training category.</Text>
      </View>
      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search all skills" />
      </View>
      {query.isLoading ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={results}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon={Search}
              title={search.trim() ? "No matching skills" : "Search the skill library"}
              subtitle={search.trim() ? "Try a broader term or another sport." : "Type a movement, technique, or training goal."}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} />}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={colors.court}
            />
          }
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
  title: {
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
  searchWrap: {
    marginBottom: 14,
  },
  list: {
    flex: 1,
  },
});
