import { useCallback, useState } from "react";
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, MoreHorizontal } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getLinksByIds, type SavedLinkResource } from "@/lib/data";
import { getKeys, setFlag } from "@/lib/localState";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

export default function SavedTab() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      setSavedIds(getKeys("saved:").map((key) => key.replace("saved:", "")));
    }, []),
  );

  const query = useQuery({
    queryKey: ["saved", savedIds],
    queryFn: () => getLinksByIds(savedIds),
    enabled: savedIds.length > 0,
    staleTime: 600000,
  });

  function handleUnsave(id: string) {
    setFlag(`saved:${id}`, false);
    setSavedIds((current) => current.filter((item) => item !== id));
  }

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader title="Saved" subtitle="Your library" showMenu />
      </View>
      {query.isLoading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <FlashList<SavedLinkResource>
          data={query.data ?? []}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={Bookmark}
                title="Nothing saved yet"
                subtitle="Tap the bookmark on any resource to keep it for later."
              />
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                setSavedIds(getKeys("saved:").map((key) => key.replace("saved:", "")));
                query.refetch();
              }}
              tintColor={colors.ink}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => Linking.openURL(item.url)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.thumbWrap}>
                {item.thumbnail_url ? (
                  <Image source={item.thumbnail_url} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={styles.thumbFallback} />
                )}
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title ?? item.url}
                </Text>
                {item.primary_skill ? (
                  <Text style={styles.context} numberOfLines={1}>
                    {item.primary_skill.category_name} · {item.primary_skill.name}
                  </Text>
                ) : null}
                <Text style={styles.domain} numberOfLines={1}>
                  {item.domain}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => handleUnsave(item.id)}
                  hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                  style={styles.iconTap}
                  accessibilityRole="button"
                  accessibilityLabel="Unsave resource"
                >
                  <BookmarkCheck size={20} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                </Pressable>
                <Pressable
                  onPress={() => Linking.openURL(item.url)}
                  hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                  style={styles.iconTap}
                  accessibilityRole="button"
                  accessibilityLabel="More"
                >
                  <MoreHorizontal size={20} color={colors.muted} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.page,
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
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbFallback: {
    flex: 1,
    backgroundColor: colors.bgGroup,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: 2,
  },
  title: {
    ...typography.rowTitle,
    fontSize: 15,
  },
  context: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  domain: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "500",
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.page + 96 + spacing.sm,
    marginRight: spacing.page,
    backgroundColor: colors.divider,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.page,
  },
  emptyWrap: {
    paddingHorizontal: spacing.page,
  },
});
