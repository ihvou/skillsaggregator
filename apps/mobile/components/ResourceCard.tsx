import { useState } from "react";
import { Linking, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Bookmark, BookmarkCheck, Check, CheckCircle, ExternalLink } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag, setFlag } from "@/lib/localState";
import { colors } from "@/lib/theme";

interface ResourceCardProps {
  resource: SkillResource;
  density?: "compact" | "comfortable";
}

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

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 36 && Math.abs(gesture.dy) < 18,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -64) toggleSaved();
      if (gesture.dx > 64) toggleCompleted();
    },
  });
  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;
  const CompletedIcon = isCompleted ? CheckCircle : Check;

  return (
    <Pressable
      {...panResponder.panHandlers}
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
            <BookmarkCheck size={17} color={colors.white} fill={colors.court} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.meta}>
          <Text style={styles.domain}>{resource.link.domain}</Text>
          {resource.skill_level ? <Text style={styles.level}>{resource.skill_level}</Text> : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {resource.link.title ?? resource.link.url}
        </Text>
        {resource.public_note ? (
          <Text style={styles.note} numberOfLines={1}>
            {resource.public_note}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            onPress={toggleSaved}
            style={[styles.iconButton, isSaved && styles.iconButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Save resource"
          >
            <SavedIcon
              size={18}
              color={isSaved ? colors.white : colors.court}
              fill={isSaved ? "rgba(255,255,255,0.24)" : "transparent"}
            />
          </Pressable>
          <Pressable
            onPress={toggleCompleted}
            style={[styles.iconButton, isCompleted && styles.iconButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Mark completed"
          >
            <CompletedIcon
              size={18}
              color={isCompleted ? colors.white : colors.court}
              fill={isCompleted ? "rgba(255,255,255,0.24)" : "transparent"}
            />
          </Pressable>
          <ExternalLink size={18} color={colors.graphite} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 120,
    flexDirection: "row",
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 10,
  },
  comfortableCard: {
    minHeight: 168,
  },
  pressed: {
    opacity: 0.72,
  },
  completed: {
    borderColor: "rgba(45,106,79,0.36)",
    backgroundColor: "rgba(45,106,79,0.04)",
  },
  thumbWrap: {
    width: 96,
    minHeight: 96,
    overflow: "hidden",
    borderRadius: 7,
    backgroundColor: "rgba(16,32,38,0.08)",
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
    color: colors.graphite,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "capitalize",
  },
  savedOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(16,32,38,0.68)",
  },
  body: {
    flex: 1,
    justifyContent: "center",
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  domain: {
    color: colors.graphite,
    fontSize: 12,
    fontWeight: "700",
  },
  level: {
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "rgba(217,119,6,0.12)",
    color: colors.amber,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  note: {
    marginTop: 5,
    color: colors.graphite,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  iconButtonActive: {
    backgroundColor: colors.court,
    borderColor: colors.court,
  },
});
