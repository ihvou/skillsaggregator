import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { BookmarkCheck } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag } from "@/lib/localState";
import { colors, radius, shadows } from "@/lib/theme";

interface ResourceTileProps {
  resource: SkillResource;
  /** Optional pixel width override. Defaults to a fixed 180. */
  width?: number;
}

/**
 * Pure thumbnail tile used inside horizontal-scrolling rows on the Category
 * screen. Native 16/11 proportions, rounded, with the standard thumbnail
 * shadow + a small saved-state badge in the top-right.
 */
export function ResourceTile({ resource, width = 180 }: ResourceTileProps) {
  const isSaved = getFlag(`saved:${resource.link.id}`);
  const style = [styles.thumbnail, { width, height: Math.round((width * 11) / 16) }];

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
});
