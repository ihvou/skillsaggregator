import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { BookmarkCheck } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag } from "@/lib/localState";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

interface ResourceTileProps {
  resource: SkillResource;
}

/**
 * Compact rectangular tile for use in horizontal-scrolling rows
 * ("Apple Podcasts" style horizontal carousel inside a category).
 */
export function ResourceTile({ resource }: ResourceTileProps) {
  const isSaved = getFlag(`saved:${resource.link.id}`);

  return (
    <Pressable
      onPress={() => Linking.openURL(resource.link.url)}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={styles.thumbnail}>
        {resource.link.thumbnail_url ? (
          <Image
            source={resource.link.thumbnail_url}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={resource.link.title ?? ""}
          />
        ) : (
          <View style={styles.fallback} />
        )}
        {isSaved ? (
          <View style={styles.savedOverlay}>
            <BookmarkCheck size={12} color={colors.surface} fill={colors.surface} />
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {resource.link.title ?? resource.link.url}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {resource.skill_level ? `${capitalize(resource.skill_level)} · ${resource.link.domain}` : resource.link.domain}
      </Text>
    </Pressable>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  wrap: {
    width: 168,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnail: {
    width: 168,
    aspectRatio: 16 / 11,
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.bgGroup,
    ...shadows.thumbnail,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    backgroundColor: colors.bgGroup,
  },
  savedOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: colors.accent,
  },
  title: {
    marginTop: spacing.sm,
    ...typography.rowTitle,
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    marginTop: 2,
    ...typography.meta,
    fontSize: 12,
  },
});
