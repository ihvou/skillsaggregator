import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Image } from "expo-image";
import type { SkillSummary } from "@skillsaggregator/shared";
import type { LevelFilterValue } from "./LevelFilter";
import { colors } from "@/lib/theme";

interface SkillCardProps {
  skill: SkillSummary;
  level?: LevelFilterValue;
}

export function SkillCard({ skill, level = "all" }: SkillCardProps) {
  const href = level === "all"
    ? `/${skill.category_slug}/${skill.slug}`
    : `/${skill.category_slug}/${skill.slug}?level=${level}`;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link href={href as any} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.header}>
          <Text style={styles.title}>{skill.name}</Text>
          <Text style={styles.count}>{skill.resource_count}</Text>
        </View>
        <Text style={styles.description} numberOfLines={3}>
          {skill.description}
        </Text>
        {skill.preview_thumbnails?.length ? (
          <View style={styles.previewStrip}>
            {skill.preview_thumbnails.map((thumbnailUrl) => (
              <Image
                key={thumbnailUrl}
                source={thumbnailUrl}
                style={styles.previewThumb}
                contentFit="cover"
                accessibilityLabel=""
              />
            ))}
          </View>
        ) : null}
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
  previewStrip: {
    marginTop: 12,
    flexDirection: "row",
    gap: 6,
  },
  previewThumb: {
    width: 76,
    height: 46,
    borderRadius: 6,
    backgroundColor: "rgba(16,32,38,0.08)",
  },
});
