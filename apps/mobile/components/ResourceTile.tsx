import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { BookmarkCheck } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag } from "@/lib/localState";
import { colors, radius, shadows } from "@/lib/theme";

interface ResourceTileProps {
  resource: SkillResource;
  /** Pixel width override. Default matches the Skill-screen card thumbnail. */
  width?: number;
}

/**
 * Pure thumbnail tile used inside horizontal-scrolling rows on the Category
 * screen. 16/9 native YouTube proportions, same radius/shadow as the
 * Skill-screen card thumbnail.
 */
export function ResourceTile({ resource, width = 170 }: ResourceTileProps) {
  const isSaved = getFlag(`saved:${resource.link.id}`);
  const height = Math.round((width * 9) / 16);
  const style = [styles.thumbnail, { width, height }];

  return (
    <Pressable
      onPress={() => Linking.openURL(resource.link.url)}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={resource.link.title ?? "Open resource"}
    >
      <View style={style}>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // sized by inner thumbnail; no extra width
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnail: {
    overflow: "hidden",
    borderRadius: radius.md,
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
});
