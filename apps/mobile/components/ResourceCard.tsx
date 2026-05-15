import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Bookmark, BookmarkCheck, Check, CheckCircle2, MoreHorizontal } from "lucide-react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag, setFlag } from "@/lib/localState";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

interface ResourceCardProps {
  resource: SkillResource;
  /** Optional label to render above the title (e.g. a date or breadcrumb). */
  topLabel?: string;
  /** Show category/skill breadcrumb instead of plain domain in meta row. */
  showContext?: boolean;
}

type SwipeDirection = "left" | "right";

const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function triggerSelectionHaptic() {
  Haptics.selectionAsync().catch(() => undefined);
}

function formatTopDate(iso?: string | null) {
  if (!iso) return undefined;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return undefined;
  const date = new Date(parsed);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Apple Podcasts "Saved" / episode row.
 *  - Rectangular rounded thumbnail on the left with subtle shadow
 *  - Right column: optional small label, 2-line bold title, meta line
 *  - Far-right column of small action icons (save / complete / more)
 *  - Tap opens the URL; swipe right to save, swipe left to mark complete
 */
export function ResourceCard({ resource, topLabel, showContext = false }: ResourceCardProps) {
  const [isSaved, setIsSaved] = useState(() => getFlag(`saved:${resource.link.id}`));
  const [isCompleted, setIsCompleted] = useState(() => getFlag(`completed:${resource.link.id}`));

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

  function handleSwipeOpen(direction: SwipeDirection, swipeable: Swipeable) {
    if (direction === "right") toggleSaved();
    if (direction === "left") toggleCompleted();
    swipeable.close();
  }

  function renderLeftActions() {
    return (
      <View style={[styles.swipeAction, styles.completeAction]}>
        <CheckCircle2 size={22} color={colors.surface} />
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

  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;
  const breadcrumb = resource.skill?.category_name && resource.skill?.name
    ? `${resource.skill.category_name} · ${resource.skill.name}`
    : resource.link.domain;
  const metaText = showContext ? breadcrumb : resource.link.domain;
  const resolvedTopLabel = topLabel ?? formatTopDate(resource.created_at);

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
          {resolvedTopLabel ? <Text style={styles.topLabel}>{resolvedTopLabel}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>
            {resource.link.title ?? resource.link.url}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {resource.skill_level ? `${capitalize(resource.skill_level)} · ${metaText}` : metaText}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={toggleSaved}
            hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
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
            onPress={toggleCompleted}
            hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
            style={styles.iconTap}
            accessibilityRole="button"
            accessibilityLabel={isCompleted ? "Mark not completed" : "Mark completed"}
          >
            {isCompleted ? (
              <CheckCircle2 size={20} color={colors.accent} fill={colors.accent} stroke={colors.surface} strokeWidth={2} />
            ) : (
              <Check size={20} color={colors.muted} strokeWidth={2} />
            )}
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(resource.link.url)}
            hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
            style={styles.iconTap}
            accessibilityRole="button"
            accessibilityLabel="Open resource"
          >
            <MoreHorizontal size={20} color={colors.muted} />
          </Pressable>
        </View>
      </Pressable>
    </Swipeable>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  thumbWrap: {
    width: 96,
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
    justifyContent: "center",
    gap: 2,
  },
  topLabel: {
    ...typography.date,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: {
    ...typography.rowTitle,
  },
  meta: {
    marginTop: 2,
    ...typography.meta,
    fontSize: 12,
  },
  actions: {
    alignItems: "center",
    gap: 14,
    paddingLeft: spacing.xs,
  },
  iconTap: {
    minWidth: 24,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
