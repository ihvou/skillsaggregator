import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, PlusCircle } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getSavedResources } from "@/lib/data";
import {
  getKeys,
  getSavedResourceSnapshots,
  reconcileSavedResourceSnapshots,
} from "@/lib/localState";
import { useOnboardingGate } from "@/lib/useOnboardingGate";
import { colors, spacing } from "@/lib/theme";

function readSavedIds() {
  return getKeys("saved:").map((key) => key.replace("saved:", ""));
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export default function SavedTab() {
  const router = useRouter();
  useOnboardingGate();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<SkillResource[]>([]);

  const refreshLocalLibrary = useCallback(() => {
    const ids = readSavedIds();
    const snapshots = getSavedResourceSnapshots(ids);
    setSavedIds((current) => (sameIds(current, ids) ? current : ids));
    setLocalSnapshots(snapshots);
    console.info("[saved-library] Refreshed local saved library", {
      savedCount: ids.length,
      snapshotCount: snapshots.length,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocalLibrary();
    }, [refreshLocalLibrary]),
  );

  const query = useQuery({
    queryKey: ["saved", savedIds],
    queryFn: () => getSavedResources(savedIds),
    enabled: savedIds.length > 0,
    staleTime: 600000,
    ...(localSnapshots.length > 0 ? { placeholderData: localSnapshots } : {}),
  });

  useEffect(() => {
    if (!query.isSuccess || query.isPlaceholderData || savedIds.length === 0) return;
    const refreshed = query.data ?? [];
    reconcileSavedResourceSnapshots(savedIds, refreshed);
    refreshLocalLibrary();
    console.info("[saved-library] Reconciled saved library from network", {
      requestedCount: savedIds.length,
      refreshedCount: refreshed.length,
    });
  }, [
    query.data,
    query.isPlaceholderData,
    query.isSuccess,
    refreshLocalLibrary,
    savedIds,
  ]);

  const displayResources = query.data ?? localSnapshots;
  const showSkeleton = savedIds.length > 0 && displayResources.length === 0 && query.isLoading;

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader title="Saved" subtitle="Your library" />
      </View>
      {showSkeleton ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <FlashList<SkillResource>
          data={displayResources}
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
          ListFooterComponent={
            <View style={styles.footerWrap}>
              <View style={styles.divider} />
              <View style={styles.footerInner}>
                <SubmitLinkButton onPress={() => router.push("/suggest")} />
              </View>
            </View>
          }
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
                refreshLocalLibrary();
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

function SubmitLinkButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.submitLink, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Submit a new link"
    >
      <PlusCircle size={18} color={colors.ink} />
      <Text style={styles.submitLinkText}>Submit a new link</Text>
    </Pressable>
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
    paddingVertical: spacing.lg,
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
  footerWrap: {
    paddingTop: spacing.md,
  },
  footerInner: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
  },
  submitLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  submitLinkText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
});
