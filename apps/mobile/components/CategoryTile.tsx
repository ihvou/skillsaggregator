import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import type { CategorySummary } from "@skillsaggregator/shared";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

interface CategoryTileProps {
  category: CategorySummary & { resource_count?: number; preview_thumbnail?: string | null };
  size?: "lg" | "md";
}

const CATEGORY_EMOJI: Record<string, string> = {
  badminton: "🏸",
  padel: "🎾",
  "gym-men": "🏋️‍♂️",
  "gym-women": "🏋️‍♀️",
  surfing: "🏄",
};

/**
 * Apple Podcasts "Top Show" tile. Large rounded thumbnail with metadata below.
 * Uses a representative resource thumbnail when available, falls back to a category emoji.
 */
export function CategoryTile({ category, size = "lg" }: CategoryTileProps) {
  const dims = size === "lg" ? styles.large : styles.medium;
  const emoji = CATEGORY_EMOJI[category.slug] ?? "📚";

  return (
    <Link href={`/${category.slug}`} asChild>
      <Pressable style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
        <View style={[styles.thumbnail, dims]}>
          {category.preview_thumbnail ? (
            <Image
              source={category.preview_thumbnail}
              style={styles.image}
              contentFit="cover"
              accessibilityLabel={category.name}
            />
          ) : (
            <View style={styles.fallback}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {category.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {typeof category.resource_count === "number" && category.resource_count > 0
            ? `${category.resource_count} resources`
            : "Updated regularly"}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 180,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnail: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.bgGroup,
    ...shadows.thumbnail,
  },
  large: {
    width: 180,
    height: 180,
  },
  medium: {
    width: 140,
    height: 140,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgGroup,
  },
  emoji: {
    fontSize: 72,
  },
  title: {
    marginTop: spacing.sm,
    ...typography.rowTitle,
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    marginTop: 2,
    ...typography.meta,
    fontSize: 12,
  },
});
