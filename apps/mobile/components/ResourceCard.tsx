import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Bookmark, BookmarkCheck, Check, CheckCircle, ExternalLink } from "lucide-react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag, setFlag } from "@/lib/localState";
import { colors } from "@/lib/theme";

interface ResourceCardProps {
  resource: SkillResource;
  density?: "compact" | "comfortable";
}

type SwipeDirection = "left" | "right";

function triggerSelectionHaptic() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function ResourceCard({ resource, density = "compact" }: ResourceCardProps) {
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
        <CheckCircle size={22} color={colors.white} />
        <Text style={styles.swipeActionText}>{isCompleted ? "Undo" : "Complete"}</Text>
      </View>
    );
  }

  function renderRightActions() {
    return (
      <View style={[styles.swipeAction, styles.saveAction]}>
        <BookmarkCheck size={22} color={colors.white} />
        <Text style={styles.swipeActionText}>{isSaved ? "Unsave" : "Save"}</Text>
      </View>
    );
  }

  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;
  const CompletedIcon = isCompleted ? CheckCircle : Check;

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
        style={({ pressed }) => [
          styles.card,
          density === "comfortable" && styles.comfortableCard,
          pressed && styles.pressed,
          isCompleted && styles.completed,
        ]}
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
            <View style={styles.thumbnailFallback}>
              <Text style={styles.thumbnailText}>{resource.link.content_type ?? "resource"}</Text>
            </View>
          )}
          {isSaved ? (
            <View style={styles.savedOverlay}>
              <BookmarkCheck size={14} color={colors.white} fill={colors.white} />
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {resource.link.title ?? resource.link.url}
          </Text>
          {resource.public_note ? (
            <Text style={styles.note} numberOfLines={2}>
              {resource.public_note}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {resource.skill_level ? (
              <Text style={styles.level}>{resource.skill_level}</Text>
            ) : null}
            <Text style={styles.domain}>{resource.link.domain}</Text>
            <View style={styles.actions}>
              <Pressable
                onPress={toggleSaved}
                hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel="Save resource"
              >
                <SavedIcon
                  size={20}
                  color={isSaved ? colors.court : colors.muted}
                  fill={isSaved ? colors.court : "transparent"}
                />
              </Pressable>
              <Pressable
                onPress={toggleCompleted}
                hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel="Mark completed"
              >
                <CompletedIcon
                  size={20}
                  color={isCompleted ? colors.court : colors.muted}
                  fill={isCompleted ? colors.court : "transparent"}
                />
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(resource.link.url)}
                hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel="Open resource"
              >
                <ExternalLink size={20} color={colors.muted} />
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
    borderRadius: 12,
  },
  swipeAction: {
    width: 104,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
  },
  saveAction: {
    backgroundColor: colors.court,
  },
  completeAction: {
    backgroundColor: colors.ink,
  },
  swipeActionText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 12,
  },
  comfortableCard: {
    minHeight: 168,
  },
  pressed: {
    opacity: 0.7,
  },
  completed: {
    backgroundColor: colors.tint,
  },
  thumbWrap: {
    width: 104,
    aspectRatio: 16 / 11,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "rgba(16,32,38,0.06)",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailText: {
    paddingHorizontal: 8,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "capitalize",
  },
  savedOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: colors.court,
  },
  body: {
    flex: 1,
    justifyContent: "space-between",
    gap: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  note: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  level: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.tint,
    color: colors.court,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
    letterSpacing: 0.2,
  },
  domain: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
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
