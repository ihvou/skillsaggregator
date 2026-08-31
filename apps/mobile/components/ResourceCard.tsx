import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  Camera,
  CircleCheck,
  Flag,
  Globe,
  Music2,
  PlaySquare,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react-native";
import {
  boundedUserVoteWeight,
  formatAggregateScore,
  getLinkSource,
  type SkillResource,
} from "@skillsaggregator/shared";
import { useAuth } from "@/lib/auth";
import { recordWatchedForReviewPrompt } from "@/lib/storeReview";
import { getSupabase } from "@/lib/supabase";
import { colors, radius, shadows, spacing, typography } from "@/lib/theme";
import { openTutorialResource } from "@/lib/tutorialReturnPrompt";
import { webUrl } from "@/lib/webLinks";

interface ResourceCardProps {
  resource: SkillResource;
  initialSaved?: boolean;
  initialCompleted?: boolean;
}

/**
 * The right-hand metadata column owns this height (4 visual rows: source+pill,
 * title line 1, title line 2, domain+actions). The 16/9 thumbnail then
 * stretches to match it via `alignSelf: "stretch"` + `aspectRatio`.
 */
// The 16/9 thumbnail stretches to this height, so it also sets the thumbnail size:
// 90 -> 160x90, leaving enough right-column width for the score + report actions
// on narrow Android devices.
const BODY_HEIGHT = 90;

function triggerSelectionHaptic() {
  Haptics.selectionAsync().catch(() => undefined);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Small platform icon shown top-left in place of the domain text.
function SourceIcon({ link }: { link: SkillResource["link"] }) {
  const source = getLinkSource(link);
  if (source === "youtube") {
    return <PlaySquare size={15} color="#FF0000" />;
  }
  if (source === "tiktok") return <Music2 size={14} color={colors.ink} />;
  if (source === "instagram") return <Camera size={14} color="#C13584" />;
  return <Globe size={12} color={colors.faint} />;
}

function isPortraitResource(resource: SkillResource) {
  const source = getLinkSource(resource.link);
  return source === "tiktok" || source === "instagram";
}

function statusLabel(status: SkillResource["catalog_status"]) {
  if (status === "private") return "Private";
  if (status === "in_review") return "In review";
  if (status === "in_catalog") return "In catalogue";
  if (status === "not_added") return "Reviewed";
  return null;
}

/**
 * Skill-screen resource row.
 *  - 16/9 thumbnail on the left at row-height (so its bottom aligns with
 *    the bottom of the actions row)
 *  - Right column: top meta row (source + level pill), 2-line title,
 *    bottom row (domain + check/bookmark/thumbs-up + count + thumbs-down)
 *  - Thumbnail/title taps open the URL; action buttons are siblings rather
 *    than nested inside a card-wide press handler.
 */
export function ResourceCard({
  resource,
  initialSaved = false,
  initialCompleted = false,
}: ResourceCardProps) {
  const resolvedRelationId = resource.link_skill_relation_id ?? (resource.catalog_status ? null : resource.id);
  const relationId =
    resource.catalog_status && resource.catalog_status !== "in_catalog"
      ? null
      : resolvedRelationId;
  const linkId = resource.link.id;
  const { user, ensureSession } = useAuth();
  const queryClient = useQueryClient();
  const savedFromResource = initialSaved || Boolean(resource.personal_list_id);
  const [isSaved, setIsSaved] = useState(savedFromResource);
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [userScore, setUserScore] = useState(resource.user_score ?? 0);
  const [baseScore, setBaseScore] = useState<number | null>(
    typeof resource.combined_score === "number" && Number.isFinite(resource.combined_score)
      ? resource.combined_score - boundedUserVoteWeight(resource.user_score)
      : null,
  );
  const combinedScore = baseScore === null ? null : baseScore + boundedUserVoteWeight(userScore);

  useEffect(() => {
    setIsSaved(savedFromResource);
    setIsCompleted(initialCompleted);
    setUserScore(resource.user_score ?? 0);
    setBaseScore(
      typeof resource.combined_score === "number" && Number.isFinite(resource.combined_score)
        ? resource.combined_score - boundedUserVoteWeight(resource.user_score)
        : null,
    );
  }, [initialCompleted, resource.combined_score, resource.id, resource.user_score, savedFromResource]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    if (!supabase || !user) {
      setIsSaved(savedFromResource);
      setIsCompleted(initialCompleted);
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
          .eq("link_id", linkId)
          .maybeSingle(),
        relationId
          ? supabaseClient
              .from("user_watched")
              .select("watched_at")
              .eq("user_id", currentUser.id)
              .eq("link_skill_relation_id", relationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        relationId
          ? supabaseClient
              .from("user_relation_votes")
              .select("vote")
              .eq("user_id", currentUser.id)
              .eq("link_skill_relation_id", relationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
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
  }, [initialCompleted, linkId, relationId, savedFromResource, user]);

  async function ensureActionSession(action: string) {
    try {
      return await ensureSession(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[resource-actions] Anonymous session creation failed", {
        relationId,
        linkId,
        action,
        error: message,
      });
      Alert.alert("Action unavailable", message);
      return null;
    }
  }

  async function toggleSaved() {
    if (!(await ensureActionSession("save_resource"))) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const next = !isSaved;
    setIsSaved(next);
    const { error } = relationId
      ? await supabase.rpc("set_user_bookmark", {
          p_relation_id: relationId,
          p_saved: next,
        })
      : await supabase.rpc("set_user_link_bookmark", {
          p_link_id: linkId,
          p_saved: next,
        });
    if (error) {
      setIsSaved(!next);
      Alert.alert("Save failed", error.message);
      console.warn("[resource-actions] Bookmark write failed", { relationId, linkId, error: error.message });
      return;
    }
    triggerSelectionHaptic();
    void queryClient.invalidateQueries({ queryKey: ["user-library"] });
  }

  async function toggleCompleted() {
    if (!relationId) {
      Alert.alert("Still in review", "This link can be marked watched after it joins the catalogue.");
      return;
    }
    if (!(await ensureActionSession("mark_watched"))) return;
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
    if (next) void recordWatchedForReviewPrompt(relationId);
    triggerSelectionHaptic();
    void queryClient.invalidateQueries({ queryKey: ["user-library"] });
  }

  async function writeVote(nextVote: -1 | 0 | 1) {
    if (!relationId) {
      Alert.alert("Still in review", "Votes are available after this link joins the catalogue.");
      return;
    }
    if (!(await ensureActionSession("vote_resource"))) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const previousVote = vote;
    const previousUserScore = userScore;
    setVote(nextVote);
    setUserScore(previousUserScore - previousVote + nextVote);
    const { data, error } = await supabase
      .rpc("set_user_vote", {
        p_relation_id: relationId,
        p_vote: nextVote,
      })
      .single();
    if (error) {
      setVote(previousVote);
      setUserScore(previousUserScore);
      Alert.alert("Vote failed", error.message);
      console.warn("[resource-actions] Vote write failed", { relationId, vote: nextVote, error: error.message });
      return;
    }
    const row = data as {
      vote?: number | null;
      user_score?: number | null;
      combined_score?: number | null;
    } | null;
    const returnedVote = row?.vote;
    setVote(returnedVote === -1 ? -1 : returnedVote === 1 ? 1 : 0);
    if (typeof row?.user_score === "number") setUserScore(row.user_score);
    if (typeof row?.combined_score === "number" && typeof row?.user_score === "number") {
      setBaseScore(row.combined_score - boundedUserVoteWeight(row.user_score));
    }
    triggerSelectionHaptic();
  }

  function toggleUpvote() {
    void writeVote(vote === 1 ? 0 : 1);
  }

  function toggleDownvote() {
    void writeVote(vote === -1 ? 0 : -1);
  }

  function openResource() {
    void openTutorialResource(resource, { alreadyWatched: isCompleted });
  }

  function reportResource() {
    const resourceId = encodeURIComponent(relationId ?? resource.id);
    const link = encodeURIComponent(linkId);
    const title = resource.link.title ? `&title=${encodeURIComponent(resource.link.title)}` : "";
    void Linking.openURL(webUrl(`/support?resource=${resourceId}&link=${link}${title}`));
  }

  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;
  const contributor = resource.link.contributor_profile;
  const portrait = isPortraitResource(resource);
  const catalogueStatus = statusLabel(resource.catalog_status);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={openResource}
        onLongPress={toggleSaved}
        style={({ pressed }) => [styles.thumbWrap, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={resource.link.title ?? "Open resource"}
      >
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
      </Pressable>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.dateGroup}>
            <SourceIcon link={resource.link} />
          </View>
          <View style={styles.pillGroup}>
            {catalogueStatus ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusText} numberOfLines={1}>
                  {catalogueStatus}
                </Text>
              </View>
            ) : null}
            {resource.skill_level ? (
              <View style={styles.levelPill}>
                {/* numberOfLines guards against "Intermedi/ate" wrapping mid-word
                    when the title row is tight on narrow screens. */}
                <Text style={styles.levelText} numberOfLines={1}>
                  {capitalize(resource.skill_level)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={openResource}
          onLongPress={toggleSaved}
          style={({ pressed }) => [styles.titleTap, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={resource.link.title ?? "Open resource"}
        >
          <Text style={styles.title} numberOfLines={2}>
            {resource.link.title ?? resource.link.url}
          </Text>
        </Pressable>
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
              onPress={reportResource}
              hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
              style={styles.iconTap}
              accessibilityRole="link"
              accessibilityLabel="Report resource"
            >
              <Flag size={17} color={colors.muted} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={toggleCompleted}
              hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
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
              hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
              style={styles.iconTap}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? "Remove from Watch later" : "Add to Watch later"}
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
                hitSlop={{ top: 10, right: 6, bottom: 10, left: 6 }}
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
              {combinedScore !== null ? (
                <Text
                  style={[
                    styles.scoreText,
                    vote === 1 ? styles.scorePositive : vote === -1 ? styles.scoreNegative : null,
                  ]}
                  accessibilityLabel={`Score ${formatAggregateScore(combinedScore)}, from coach review and community votes`}
                  accessibilityLiveRegion="polite"
                >
                  {formatAggregateScore(combinedScore)}
                </Text>
              ) : null}
              <Pressable
                onPress={toggleDownvote}
                hitSlop={{ top: 10, right: 6, bottom: 10, left: 6 }}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  pillGroup: {
    flexShrink: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  statusPill: {
    maxWidth: 88,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgGroup,
  },
  statusText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
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
  titleTap: {
    minHeight: 44,
    justifyContent: "center",
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
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  iconTap: {
    minWidth: 20,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingTap: {
    minWidth: 20,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    minWidth: 24,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  scorePositive: {
    color: colors.accent,
  },
  scoreNegative: {
    color: colors.ink,
  },
});
