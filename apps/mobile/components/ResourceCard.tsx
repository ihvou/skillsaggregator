import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag, setFlag } from "@/lib/localState";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

interface ResourceCardProps {
  resource: SkillResource;
}

type SwipeDirection = "left" | "right";

/**
 * The right-hand metadata column owns this height (4 visual rows: date+pill,
 * title line 1, title line 2, domain+actions). The 16/9 thumbnail then
 * stretches to match it via `alignSelf: "stretch"` + `aspectRatio`.
 */
const BODY_HEIGHT = 96;

function triggerSelectionHaptic() {
  Haptics.selectionAsync().catch(() => undefined);
}

function formatDate(iso?: string | null) {
  if (!iso) return undefined;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return undefined;
  const date = new Date(parsed);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getFullYear()}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const rounded = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1);
    return `${value < 0 ? "-" : ""}${rounded}k`;
  }
  return String(value);
}

/**
 * Skill-screen resource row.
 *  - 16/9 thumbnail on the left at row-height (so its bottom aligns with
 *    the bottom of the actions row)
 *  - Right column: top meta row (date + level pill), 2-line title,
 *    bottom row (domain + check/bookmark/thumbs-up + count + thumbs-down)
 *  - Tap opens the URL; swipe right to save, swipe left to mark complete
 */
export function ResourceCard({ resource }: ResourceCardProps) {
  const [isSaved, setIsSaved] = useState(() => getFlag(`saved:${resource.link.id}`));
  const [isCompleted, setIsCompleted] = useState(() => getFlag(`completed:${resource.link.id}`));
  const [upvoted, setUpvoted] = useState(() => getFlag(`upvote:${resource.link.id}`));
  const [downvoted, setDownvoted] = useState(() => getFlag(`downvote:${resource.link.id}`));

  function toggleSaved() {
    const next = !isSaved;
    setIsSaved(next);
    setFlag(`saved:${resource.link.id}`, next);
    triggerSelectionHaptic();
  }

  function toggleCompleted() {
    const next = !isCompleted;
    setIsCompleted(next);
    setFlag(`completed:${resource.link.id}`, next);
    triggerSelectionHaptic();
  }

  function toggleUpvote() {
    const next = !upvoted;
    setUpvoted(next);
    setFlag(`upvote:${resource.link.id}`, next);
    if (next && downvoted) {
      setDownvoted(false);
      setFlag(`downvote:${resource.link.id}`, false);
    }
    triggerSelectionHaptic();
  }

  function toggleDownvote() {
    const next = !downvoted;
    setDownvoted(next);
    setFlag(`downvote:${resource.link.id}`, next);
    if (next && upvoted) {
      setUpvoted(false);
      setFlag(`upvote:${resource.link.id}`, false);
    }
    triggerSelectionHaptic();
  }

  function handleSwipeOpen(direction: SwipeDirection, swipeable: Swipeable) {
    if (direction === "right") toggleSaved();
    if (direction === "left") toggleCompleted();
    swipeable.close();
  }

  function renderLeftActions() {
    return (
      <View style={[styles.swipeAction, styles.completeAction]}>
        <CircleCheck size={22} color={colors.surface} />
        <Text style={styles.swipeActionText}>{isCompleted ? "Undo" : "Done"}</Text>
      </View>
    );
  }

  function renderRightActions() {
    return (
      <View style={[styles.swipeAction, styles.saveAction]}>
        <BookmarkCheck size={22} color={colors.surface} />
        <Text style={styles.swipeActionText}>{isSaved ? "Unsave" : "Save"}</Text>
      </View>
    );
  }

  const dateLabel = formatDate(resource.created_at);
  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;

  // Reddit-style net score: server upvote_count + local vote delta.
  const ratingCount = useMemo(() => {
    const base = Number.isFinite(resource.upvote_count) ? resource.upvote_count : 0;
    return base + (upvoted ? 1 : 0) - (downvoted ? 1 : 0);
  }, [resource.upvote_count, upvoted, downvoted]);

  const ratingColor = upvoted ? colors.accent : downvoted ? colors.ink : colors.muted;

  return (
    <Swipeable
      containerStyle={styles.swipeContainer}
      friction={1.8}
      leftThreshold={56}
      rightThreshold={56}
      overshootFriction={8}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
    >
      <Pressable
        onPress={() => Linking.openURL(resource.link.url)}
        onLongPress={toggleSaved}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.thumbWrap}>
          {resource.link.thumbnail_url ? (
            <Image
              source={resource.link.thumbnail_url}
              style={styles.thumbnail}
              contentFit="cover"
              accessibilityLabel={resource.link.title ?? "Resource thumbnail"}
            />
          ) : (
            <View style={styles.thumbnailFallback} />
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : <View />}
            {resource.skill_level ? (
              <View style={styles.levelPill}>
                <Text style={styles.levelText}>{capitalize(resource.skill_level)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {resource.link.title ?? resource.link.url}
          </Text>
          <View style={styles.bottomRow}>
            <Text style={styles.domain} numberOfLines={1}>
              {resource.link.domain}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={toggleCompleted}
                hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel={isCompleted ? "Mark not completed" : "Mark completed"}
              >
                <CircleCheck
                  size={18}
                  color={isCompleted ? colors.accent : colors.muted}
                  fill={isCompleted ? colors.accent : "transparent"}
                  stroke={isCompleted ? colors.surface : colors.muted}
                  strokeWidth={2}
                />
              </Pressable>
              <Pressable
                onPress={toggleSaved}
                hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel={isSaved ? "Unsave resource" : "Save resource"}
              >
                <SavedIcon
                  size={18}
                  color={isSaved ? colors.accent : colors.muted}
                  fill={isSaved ? colors.accent : "transparent"}
                  strokeWidth={2}
                />
              </Pressable>
              <View style={styles.ratingGroup}>
                <Pressable
                  onPress={toggleUpvote}
                  hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
                  style={styles.ratingTap}
                  accessibilityRole="button"
                  accessibilityLabel={upvoted ? "Remove upvote" : "Upvote"}
                >
                  <ThumbsUp
                    size={18}
                    color={upvoted ? colors.accent : colors.muted}
                    fill={upvoted ? colors.accent : "transparent"}
                    strokeWidth={2}
                  />
                </Pressable>
                <Text style={[styles.ratingCount, { color: ratingColor }]}>
                  {formatCount(ratingCount)}
                </Text>
                <Pressable
                  onPress={toggleDownvote}
                  hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
                  style={styles.ratingTap}
                  accessibilityRole="button"
                  accessibilityLabel={downvoted ? "Remove downvote" : "Downvote"}
                >
                  <ThumbsDown
                    size={18}
                    color={downvoted ? colors.ink : colors.muted}
                    fill={downvoted ? colors.ink : "transparent"}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    borderRadius: radius.md,
  },
  swipeAction: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radius.md,
  },
  saveAction: {
    backgroundColor: colors.accent,
  },
  completeAction: {
    backgroundColor: colors.ink,
  },
  swipeActionText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  thumbWrap: {
    alignSelf: "stretch",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: colors.bgGroup,
    ...shadows.thumbnail,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailFallback: {
    flex: 1,
    backgroundColor: colors.bgGroup,
  },
  body: {
    flex: 1,
    height: BODY_HEIGHT,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 22,
  },
  date: {
    ...typography.date,
    fontSize: 12,
    color: colors.muted,
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  levelText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    ...typography.rowTitle,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 22,
  },
  domain: {
    ...typography.meta,
    fontSize: 12,
    color: colors.faint,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconTap: {
    minWidth: 22,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingTap: {
    minWidth: 22,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingCount: {
    minWidth: 16,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
});
