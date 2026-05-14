import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SearchBar } from "@/components/SearchBar";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { SkeletonList } from "@/components/SkeletonList";
import { getSkillsForCategory } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function CategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const categorySlug = category ?? "badminton";
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["category", categorySlug, "skills"],
    queryFn: () => getSkillsForCategory(categorySlug),
    staleTime: 300000,
  });
  const skills = query.data?.skills ?? [];
  const searchedSkills = search.trim()
    ? skills.filter((skill) => {
        const needle = search.trim().toLowerCase();
        return `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(needle);
      })
    : skills;
  const visibleSkills = showAllSkills ? searchedSkills : searchedSkills.filter((skill) => skill.resource_count > 0);
  const hiddenEmptyCount = searchedSkills.length - visibleSkills.length;

  return (
    <Screen>
      <Stack.Screen options={{ title: query.data?.category?.name ?? "Category" }} />
      <View style={styles.header}>
        {query.data?.category?.description ? (
          <Text style={styles.subtitle}>{query.data.category.description}</Text>
        ) : null}
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search skills in this category" />
      </View>

      {hiddenEmptyCount > 0 ? (
        <Pressable
          onPress={() => setShowAllSkills((current) => !current)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Text style={styles.toggleText}>
            {showAllSkills ? "Hide empty skills" : `Show all skills (${hiddenEmptyCount} empty)`}
          </Text>
        </Pressable>
      ) : null}

      {query.isLoading ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={visibleSkills}
          style={styles.list}
          estimatedItemSize={150}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon={Search}
              title={search.trim() ? "No matching skills" : "No skills with resources yet"}
              subtitle={search.trim() ? "Try a broader skill name or clear the search." : "Use Show all skills to browse the full taxonomy."}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => <SkillCard skill={item} />}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 24 }}
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
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  searchWrap: {
    marginBottom: 12,
  },
  toggle: {
    alignSelf: "flex-start",
    minHeight: 32,
    marginBottom: 12,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: colors.tint,
  },
  pressed: {
    opacity: 0.7,
  },
  toggleText: {
    color: colors.court,
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
});
