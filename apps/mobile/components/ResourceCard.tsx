import { useState } from "react";
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

/**
 * Skill-screen resource row.
 *  - Native-proportion rectangular thumbnail on the left
 *  - Right column: top meta row (date + level pill), bold 2-line title,
 *    bottom meta row (domain + check/bookmark/thumbs-up/thumbs-down icons)
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
                  size={20}
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
                  size={20}
                  color={isSaved ? colors.accent : colors.muted}
                  fill={isSaved ? colors.accent : "transparent"}
                  strokeWidth={2}
                />
              </Pressable>
              <Pressable
                onPress={toggleUpvote}
                hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel={upvoted ? "Remove upvote" : "Upvote"}
              >
                <ThumbsUp
                  size={20}
                  color={upvoted ? colors.accent : colors.muted}
                  fill={upvoted ? colors.accent : "transparent"}
                  strokeWidth={2}
                />
              </Pressable>
              <Pressable
                onPress={toggleDownvote}
                hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel={downvoted ? "Remove downvote" : "Downvote"}
              >
                <ThumbsDown
                  size={20}
                  color={downvoted ? colors.ink : colors.muted}
                  fill={downvoted ? colors.ink : "transparent"}
                  strokeWidth={2}
                />
              </Pressable>
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
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
  thumbWrap: {
    width: 112,
    aspectRatio: 16 / 11,
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
    justifyContent: "space-between",
    gap: 4,
    paddingVertical: 2,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xs,
  },
  date: {
    ...typography.date,
    fontSize: 13,
    color: colors.muted,
  },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  levelText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    ...typography.rowTitle,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  domain: {
    ...typography.meta,
    fontSize: 13,
    color: colors.faint,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconTap: {
    minWidth: 24,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
