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
        {skill.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {skill.description}
          </Text>
        ) : null}
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
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    flex: 1,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  count: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  description: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  previewStrip: {
    marginTop: 12,
    flexDirection: "row",
    gap: 6,
  },
  previewThumb: {
    flex: 1,
    aspectRatio: 16 / 10,
    borderRadius: 8,
    backgroundColor: "rgba(16,32,38,0.06)",
  },
});
