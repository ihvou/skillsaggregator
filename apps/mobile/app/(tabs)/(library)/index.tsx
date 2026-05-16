import { useCallback, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getSavedResources } from "@/lib/data";
import { getKeys } from "@/lib/localState";
import { colors, spacing } from "@/lib/theme";

export default function SavedTab() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      setSavedIds(getKeys("saved:").map((key) => key.replace("saved:", "")));
    }, []),
  );

  const query = useQuery({
    queryKey: ["saved", savedIds],
    queryFn: () => getSavedResources(savedIds),
    enabled: savedIds.length > 0,
    staleTime: 600000,
  });

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader title="Saved" subtitle="Your library" />
      </View>
      {query.isLoading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <FlashList<SkillResource>
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
          renderItem={({ item }) => (
            <View style={styles.rowWrap}>
              <ResourceCard resource={item} />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
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
          showsVerticalScrollIndicator={false}
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
  rowWrap: {
    paddingHorizontal: spacing.page,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.page,
    backgroundColor: colors.divider,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.page,
  },
  emptyWrap: {
    paddingHorizontal: spacing.page,
  },
});
