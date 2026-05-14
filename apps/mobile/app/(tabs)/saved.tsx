import { useCallback, useState } from "react";
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getLinksByIds, type SavedLinkResource } from "@/lib/data";
import { getKeys } from "@/lib/localState";
import { colors } from "@/lib/theme";

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

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Saved</Text>
      </View>
      {query.isLoading ? (
        <SkeletonList />
      ) : (
        <FlashList<SavedLinkResource>
          data={query.data ?? []}
          style={styles.list}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon={Bookmark}
              title="Nothing saved yet"
              subtitle="Tap the bookmark on any resource to keep it for later."
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                setSavedIds(getKeys("saved:").map((key) => key.replace("saved:", "")));
                query.refetch();
              }}
              tintColor={colors.court}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => Linking.openURL(item.url)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              {item.thumbnail_url ? (
                <Image source={item.thumbnail_url} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.thumb} />
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title ?? item.url}
                </Text>
                {item.primary_skill ? (
                  <Text style={styles.context} numberOfLines={1}>
                    {item.primary_skill.category_name} / {item.primary_skill.name}
                  </Text>
                ) : null}
                <Text style={styles.domain}>{item.domain}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 14,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 12,
  },
  thumb: {
    width: 96,
    aspectRatio: 16 / 11,
    borderRadius: 8,
    backgroundColor: "rgba(16,32,38,0.06)",
  },
  rowBody: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  context: {
    color: colors.court,
    fontSize: 12,
    fontWeight: "600",
  },
  domain: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
});
