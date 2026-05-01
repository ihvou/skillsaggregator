import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import type { SkillSummary } from "@skillsaggregator/shared";
import { colors } from "@/lib/theme";

interface SkillCardProps {
  skill: SkillSummary;
}

export function SkillCard({ skill }: SkillCardProps) {
  return (
    <Link href={`/${skill.category_slug}/${skill.slug}`} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.header}>
          <Text style={styles.title}>{skill.name}</Text>
          <Text style={styles.count}>{skill.resource_count}</Text>
        </View>
        <Text style={styles.description} numberOfLines={3}>
          {skill.description}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 116,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 14,
  },
  pressed: {
    opacity: 0.72,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    flex: 1,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  count: {
    minWidth: 30,
    overflow: "hidden",
    borderRadius: 15,
    backgroundColor: "rgba(45,106,79,0.10)",
    color: colors.court,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  description: {
    marginTop: 8,
    color: colors.graphite,
    fontSize: 14,
    lineHeight: 20,
  },
});
