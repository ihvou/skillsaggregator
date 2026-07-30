import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, CheckCircle, PlusCircle } from "lucide-react-native";
import type { SkillResource } from "@skillsaggregator/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getUserLibraryResources, type UserLibraryView } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { useOnboardingGate } from "@/lib/useOnboardingGate";
import { colors, radius, spacing } from "@/lib/theme";

export default function SavedTab() {
  const router = useRouter();
  useOnboardingGate();
  const { user } = useAuth();
  const [view, setView] = useState<UserLibraryView>("saved");

  const query = useQuery({
    queryKey: ["user-library", user?.id, view],
    queryFn: () => getUserLibraryResources(user!.id, view),
    enabled: Boolean(user),
    staleTime: 600000,
  });

  const displayResources = query.data ?? [];
  const showSkeleton = Boolean(user) && displayResources.length === 0 && query.isLoading;
  const emptyIcon = view === "saved" ? Bookmark : CheckCircle;

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={styles.headerWrap}>
        <PageHeader title="Library" subtitle="Saved and watched resources" />
        <View style={styles.tabs}>
          {(["saved", "watched"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setView(item)}
              style={[styles.tab, view === item && styles.tabActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.tabText, view === item && styles.tabTextActive]}>
                {item === "saved" ? "Saved" : "Watched"}
              </Text>
            </Pressable>
          ))}
        </View>
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
              {user ? (
                <EmptyState
                  icon={emptyIcon}
                  title={view === "saved" ? "Nothing saved yet" : "Nothing watched yet"}
                  subtitle={
                    view === "saved"
                      ? "Tap the bookmark on any resource to keep it for later."
                      : "Tap the check button after you watch a resource."
                  }
                />
              ) : (
                <EmptyState
                  icon={Bookmark}
                  title="Sign in to use your library"
                  subtitle="Saved and watched resources sync across devices after sign-in."
                />
              )}
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
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.bgGroup,
  },
  tab: {
    minHeight: 34,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  tabTextActive: {
    color: colors.ink,
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
