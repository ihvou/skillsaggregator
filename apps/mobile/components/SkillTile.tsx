import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import type { SkillSummary } from "@skillsaggregator/shared";
import { colors, radius, shadows } from "@/lib/theme";

interface SkillTileProps {
  skill: SkillSummary;
  thumbnailUrl: string | null;
  /** Square (180) by default, "wide" uses 16/11 ratio. */
  shape?: "square" | "wide";
}

/**
 * Home-screen tile representing a SKILL.
 *  - Uses the latest resource's thumbnail as background
 *  - Tints with a dark scrim so the skill name reads on top
 *  - Tap navigates to the skill page
 */
export function SkillTile({ skill, thumbnailUrl, shape = "square" }: SkillTileProps) {
  const dims = shape === "wide" ? styles.wide : styles.square;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link href={`/${skill.category_slug}/${skill.slug}` as any} asChild>
      <Pressable style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
        <View style={[styles.thumb, dims]}>
          {thumbnailUrl ? (
            <Image
              source={thumbnailUrl}
              style={styles.image}
              contentFit="cover"
              accessibilityLabel={skill.name}
            />
          ) : (
            <View style={styles.fallback} />
          )}
          <View style={styles.scrim} />
          <View style={styles.labelWrap}>
            <Text style={styles.label} numberOfLines={2}>
              {skill.name}
            </Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // shape determines inner thumb size
  },
  pressed: {
    opacity: 0.85,
  },
  thumb: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.bgGroup,
    ...shadows.thumbnail,
  },
  square: {
    width: 156,
    height: 156,
  },
  wide: {
    width: 200,
    height: 138,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    backgroundColor: colors.bgGroup,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
  },
  labelWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    top: "50%",
    transform: [{ translateY: -16 }],
    alignItems: "center",
  },
  label: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
