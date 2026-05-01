import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Bookmark, Check, ExternalLink } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { getFlag, setFlag } from "@/lib/localState";
import { colors } from "@/lib/theme";

interface ResourceCardProps {
  resource: SkillResource;
}

export function ResourceCard({ resource }: ResourceCardProps) {
  const [isSaved, setIsSaved] = useState(() => getFlag(`saved:${resource.link.id}`));
  const [isCompleted, setIsCompleted] = useState(() => getFlag(`completed:${resource.link.id}`));

  function toggleSaved() {
    const next = !isSaved;
    setIsSaved(next);
    setFlag(`saved:${resource.link.id}`, next);
  }

  function toggleCompleted() {
    const next = !isCompleted;
    setIsCompleted(next);
    setFlag(`completed:${resource.link.id}`, next);
  }

  return (
    <Pressable
      onPress={() => Linking.openURL(resource.link.url)}
      onLongPress={toggleSaved}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, isCompleted && styles.completed]}
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
          <Text style={styles.note} numberOfLines={3}>
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
            <Bookmark size={18} color={isSaved ? colors.white : colors.court} />
          </Pressable>
          <Pressable
            onPress={toggleCompleted}
            style={[styles.iconButton, isCompleted && styles.iconButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Mark completed"
          >
            <Check size={18} color={isCompleted ? colors.white : colors.court} />
          </Pressable>
          <ExternalLink size={18} color={colors.graphite} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.72,
  },
  completed: {
    opacity: 0.56,
  },
  thumbWrap: {
    aspectRatio: 16 / 9,
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
    color: colors.graphite,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  body: {
    padding: 14,
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
    marginTop: 8,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  note: {
    marginTop: 7,
    color: colors.graphite,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
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
