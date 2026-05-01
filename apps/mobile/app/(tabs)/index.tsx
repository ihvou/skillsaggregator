import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SkillCard } from "@/components/SkillCard";
import { getCategory, getSkills } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function BrowseTab() {
  const categoryQuery = useQuery({ queryKey: ["category"], queryFn: getCategory, staleTime: 300000 });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: getSkills, staleTime: 300000 });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Badminton MVP</Text>
        <Text style={styles.title}>{categoryQuery.data?.name ?? "Badminton"}</Text>
        <Text style={styles.subtitle}>
          Skill pages for technique, movement, strategy, and equipment.
        </Text>
      </View>
      {skillsQuery.isLoading ? (
        <ActivityIndicator color={colors.court} />
      ) : (
        <FlashList
          data={skillsQuery.data ?? []}
          style={styles.list}
          estimatedItemSize={132}
          keyExtractor={(item) => item.id}
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
  list: {
    flex: 1,
  },
});
