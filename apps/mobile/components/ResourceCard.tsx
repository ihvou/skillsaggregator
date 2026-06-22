import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  Globe,
  Music2,
  PlaySquare,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react-native";
import { Swipeable } from "react-native-gesture-handler";
import { getLinkSource, resourceQualityRating, type SkillResource } from "@skillsaggregator/shared";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";

interface ResourceCardProps {
  resource: SkillResource;
}

type SwipeDirection = "left" | "right";

/**
 * The right-hand metadata column owns this height (4 visual rows: date+pill,
 * title line 1, title line 2, domain+actions). The 16/9 thumbnail then
 * stretches to match it via `alignSelf: "stretch"` + `aspectRatio`.
 */
const BODY_HEIGHT = 120;

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

// Small platform icon shown top-left, before the date, in place of the domain text.
function SourceIcon({ link }: { link: SkillResource["link"] }) {
  const source = getLinkSource(link);
  if (source === "youtube") {
    return <PlaySquare size={15} color="#FF0000" />;
  }
  if (source === "tiktok") return <Music2 size={14} color={colors.ink} />;
  return <Globe size={12} color={colors.faint} />;
}

function isPortraitResource(resource: SkillResource) {
  return getLinkSource(resource.link) === "tiktok";
}

/**
 * Skill-screen resource row.
 *  - 16/9 thumbnail on the left at row-height (so its bottom aligns with
 *    the bottom of the actions row)
 *  - Right column: top meta row (date + level pill), 2-line title,
 *    bottom row (domain + check/bookmark/thumbs-up + count + thumbs-down)
 *  - Tap opens the URL; swipe right to save, swipe left to mark complete
 */
export function ResourceCard({ resource }: ResourceCardProps) {
  const relationId = resource.id;
  const { user, actionSyncRevision } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [vote, setVote] = useState<-1 | 0 | 1>(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    if (!supabase || !user) {
      setIsSaved(false);
      setIsCompleted(false);
      setVote(0);
      return;
    }
    const supabaseClient = supabase;
    const currentUser = user;

    async function loadState() {
      const [bookmarkResult, watchedResult, voteResult] = await Promise.all([
        supabaseClient
          .from("user_bookmarks")
          .select("created_at")
          .eq("user_id", currentUser.id)
          .eq("link_skill_relation_id", relationId)
          .maybeSingle(),
        supabaseClient
          .from("user_watched")
          .select("watched_at")
          .eq("user_id", currentUser.id)
          .eq("link_skill_relation_id", relationId)
          .maybeSingle(),
        supabaseClient
          .from("user_relation_votes")
          .select("vote")
          .eq("user_id", currentUser.id)
          .eq("link_skill_relation_id", relationId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (bookmarkResult.error) console.warn("[resource-actions] Bookmark load failed", bookmarkResult.error.message);
      if (watchedResult.error) console.warn("[resource-actions] Watched load failed", watchedResult.error.message);
      if (voteResult.error) console.warn("[resource-actions] Vote load failed", voteResult.error.message);
      setIsSaved(Boolean(bookmarkResult.data));
      setIsCompleted(Boolean(watchedResult.data));
      setVote(voteResult.data?.vote === -1 ? -1 : voteResult.data?.vote === 1 ? 1 : 0);
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [actionSyncRevision, relationId, user]);

  function requireSignedIn(action: string) {
    if (user) return true;
    Alert.alert("Sign in to continue", `Sign in from the Account tab to ${action}.`);
    return false;
  }

  async function toggleSaved() {
    if (!requireSignedIn("save resources")) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const next = !isSaved;
    setIsSaved(next);
    const { error } = await supabase.rpc("set_user_bookmark", {
      p_relation_id: relationId,
      p_saved: next,
    });
    if (error) {
      setIsSaved(!next);
      Alert.alert("Save failed", error.message);
      console.warn("[resource-actions] Bookmark write failed", { relationId, error: error.message });
      return;
    }
    triggerSelectionHaptic();
  }

  async function toggleCompleted() {
    if (!requireSignedIn("mark resources watched")) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const next = !isCompleted;
    setIsCompleted(next);
    const { error } = await supabase.rpc("set_user_watched", {
      p_relation_id: relationId,
      p_watched: next,
    });
    if (error) {
      setIsCompleted(!next);
      Alert.alert("Watched update failed", error.message);
      console.warn("[resource-actions] Watched write failed", { relationId, error: error.message });
      return;
    }
    triggerSelectionHaptic();
  }

  async function writeVote(nextVote: -1 | 0 | 1) {
    if (!requireSignedIn("vote on resources")) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const previousVote = vote;
    setVote(nextVote);
    const { data, error } = await supabase.rpc("set_user_vote", {
      p_relation_id: relationId,
      p_vote: nextVote,
    }).single();
    if (error) {
      setVote(previousVote);
      Alert.alert("Vote failed", error.message);
      console.warn("[resource-actions] Vote write failed", { relationId, vote: nextVote, error: error.message });
      return;
    }
    const returnedVote = (data as { vote?: number | null } | null)?.vote;
    setVote(returnedVote === -1 ? -1 : returnedVote === 1 ? 1 : 0);
    triggerSelectionHaptic();
  }

  function toggleUpvote() {
    void writeVote(vote === 1 ? 0 : 1);
  }

  function toggleDownvote() {
    void writeVote(vote === -1 ? 0 : -1);
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
  const contributor = resource.link.contributor_profile;
  const portrait = isPortraitResource(resource);
  const quality = useMemo(() => resourceQualityRating(resource), [
    resource.combined_score,
    resource.curator_score,
    resource.value_score,
  ]);

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
            <>
              {portrait ? (
                <Image
                  source={resource.link.thumbnail_url}
                  style={styles.thumbnailBackdrop}
                  contentFit="cover"
                  blurRadius={16}
                />
              ) : null}
              <Image
                source={resource.link.thumbnail_url}
                style={styles.thumbnail}
                contentFit={portrait ? "contain" : "cover"}
                accessibilityLabel={resource.link.title ?? "Resource thumbnail"}
              />
            </>
          ) : (
            <View style={styles.thumbnailFallback} />
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={styles.dateGroup}>
              <SourceIcon link={resource.link} />
              {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : null}
            </View>
            <View style={styles.pillGroup}>
              {quality ? (
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityText}>{quality.label} {quality.percent}%</Text>
                </View>
              ) : null}
              {resource.skill_level ? (
                <View style={styles.levelPill}>
                  <Text style={styles.levelText}>{capitalize(resource.skill_level)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {resource.link.title ?? resource.link.url}
          </Text>
          {resource.coach_take ? (
            <Text style={styles.coachTake} numberOfLines={1}>
              Coach's take: {resource.coach_take}
            </Text>
          ) : null}
          <View style={styles.bottomRow}>
            <View style={styles.metaLine}>
              {contributor ? (
                <View style={styles.contributorPill}>
                  <UserRound size={11} color={colors.muted} />
                  <Text style={styles.contributorText} numberOfLines={1}>
                    @{contributor.slug}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={toggleCompleted}
                hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
                style={styles.iconTap}
                accessibilityRole="button"
                accessibilityLabel={isCompleted ? "Mark not completed" : "Mark completed"}
              >
                <CircleCheck
                  size={18}
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
                  size={18}
                  color={isSaved ? colors.accent : colors.muted}
                  fill={isSaved ? colors.accent : "transparent"}
                  strokeWidth={2}
                />
              </Pressable>
              <View style={styles.ratingGroup}>
                <Pressable
                  onPress={toggleUpvote}
                  hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
                  style={styles.ratingTap}
                  accessibilityRole="button"
                  accessibilityLabel={vote === 1 ? "Remove upvote" : "Upvote"}
                >
                  <ThumbsUp
                  size={18}
                    color={vote === 1 ? colors.accent : colors.muted}
                    fill={vote === 1 ? colors.accent : "transparent"}
                    strokeWidth={2}
                  />
                </Pressable>
                <Pressable
                  onPress={toggleDownvote}
                  hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
                  style={styles.ratingTap}
                  accessibilityRole="button"
                  accessibilityLabel={vote === -1 ? "Remove downvote" : "Downvote"}
                >
                  <ThumbsDown
                    size={18}
                    color={vote === -1 ? colors.ink : colors.muted}
                    fill={vote === -1 ? colors.ink : "transparent"}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
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
    alignItems: "stretch",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  thumbWrap: {
    alignSelf: "stretch",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: colors.bgGroup,
    ...shadows.thumbnail,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.12 }],
  },
  thumbnailFallback: {
    flex: 1,
    backgroundColor: colors.bgGroup,
  },
  body: {
    flex: 1,
    height: BODY_HEIGHT,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 22,
  },
  dateGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  date: {
    ...typography.date,
    fontSize: 12,
    color: colors.muted,
  },
  pillGroup: {
    flexShrink: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
  },
  qualityPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#e7f4ed",
  },
  qualityText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  levelText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    ...typography.rowTitle,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  coachTake: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 22,
  },
  metaLine: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contributorPill: {
    maxWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.bgGroup,
  },
  contributorText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconTap: {
    minWidth: 22,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingTap: {
    minWidth: 22,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
