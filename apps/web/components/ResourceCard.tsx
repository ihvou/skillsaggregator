"use client";

import Image from "next/image";
import { useState } from "react";
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
} from "lucide-react";
import { formatAggregateScore, getLinkSource, type SkillResource } from "@skillsaggregator/shared";
import { useResourceActions } from "@/lib/useResourceActions";

interface ResourceCardProps {
  resource: SkillResource;
  initialSaved?: boolean;
  initialWatched?: boolean;
  onSavedChange?: (resource: SkillResource, saved: boolean) => void;
  onWatchedChange?: (resource: SkillResource, watched: boolean) => void;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPortraitResource(resource: SkillResource) {
  const source = getLinkSource(resource.link);
  return source === "tiktok" || source === "instagram";
}

function SourceIcon({ resource }: { resource: SkillResource }) {
  const source = getLinkSource(resource.link);
  if (source === "youtube") return <PlaySquare className="h-4 w-4 text-[#ff0000]" />;
  if (source === "tiktok") return <Music2 className="h-4 w-4 text-ink" />;
  if (source === "instagram") return <Camera className="h-4 w-4 text-[#c13584]" />;
  return <Globe className="h-4 w-4 text-faint" />;
}

function CatalogStatusChip({ resource }: { resource: SkillResource }) {
  const status = resource.catalog_status;
  if (!status) return null;
  const labels: Record<NonNullable<SkillResource["catalog_status"]>, string> = {
    private: "Private",
    in_review: "In review",
    in_catalog: "In catalogue",
    not_added: "Reviewed",
  };
  return (
    <span className="inline-flex items-center rounded-pill bg-bgGroup px-2.5 py-0.5 text-xs font-bold text-muted">
      {labels[status]}
    </span>
  );
}

/**
 * Web counterpart to the mobile ResourceCard row.
 *  - 16/9 thumbnail (left, click → opens link)
 *  - Source + level pill (top), bold 2-line title (clickable),
 *    level badge + watched/saved/vote actions.
 *  - State (save / watched / vote) is authenticated and stored server-side.
 */
export function ResourceCard({
  resource,
  initialSaved = false,
  initialWatched = false,
  onSavedChange,
  onWatchedChange,
}: ResourceCardProps) {
  const resolvedRelationId = resource.link_skill_relation_id ?? (resource.catalog_status ? null : resource.id);
  const relationId =
    resource.catalog_status && resource.catalog_status !== "in_catalog"
      ? null
      : resolvedRelationId;
  const {
    isSaved,
    isWatched,
    vote,
    error,
    toggleSaved,
    toggleWatched,
    combinedScore,
    setUserVote,
  } = useResourceActions(
    relationId,
    resource.link.id,
    resource.user_score ?? 0,
    resource.combined_score ?? null,
    { initialSaved, initialWatched },
  );

  // TikTok serves thumbnails from a SIGNED CDN URL carrying an `x-expires` stamp,
  // good for roughly 3-7 days; after that the host returns 403 and the card renders
  // a broken image. 117 of 120 stored TikTok thumbnails had expired when this was
  // added. YouTube is immune because the collector CONSTRUCTS a stable
  // i.ytimg.com/vi/<id>/hqdefault.jpg rather than storing a scraped URL.
  //
  // The real fix is mirroring into the link-thumbnails bucket at collection time.
  // This is the seatbelt: any image that fails to load falls back to the empty
  // state, which is a plain bgGroup rectangle and reads as deliberate.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnail = thumbnailFailed ? null : resource.link.thumbnail_url;
  const portrait = isPortraitResource(resource);
  const url = resource.link.url;
  const contributor = resource.link.contributor_profile;

  function onUpvote() {
    void setUserVote(vote === 1 ? 0 : 1);
  }
  function onDownvote() {
    void setUserVote(vote === -1 ? 0 : -1);
  }
  async function onToggleSaved() {
    const next = !isSaved;
    if (await toggleSaved()) onSavedChange?.(resource, next);
  }
  async function onToggleWatched() {
    const next = !isWatched;
    if (await toggleWatched()) onWatchedChange?.(resource, next);
  }

  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;
  const reportParams = new URLSearchParams({
    resource: relationId ?? resource.id,
    link: resource.link.id,
  });
  if (resource.link.title) reportParams.set("title", resource.link.title);
  const reportHref = `/support?${reportParams.toString()}`;

  return (
    // Stacked (thumbnail above text) below `sm` — a fixed-width thumb in a row
    // leaves too little room for the title/actions on phone screens.
    <article className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={resource.link.title ?? "Open resource"}
        className="focus-ring relative aspect-video w-full shrink-0 overflow-hidden rounded-[14px] bg-bgGroup shadow-thumb transition hover:opacity-90 sm:w-[240px]"
      >
        {thumbnail ? (
          <>
            {portrait ? (
              <Image
                src={thumbnail}
                alt=""
                fill
                sizes="(max-width: 639px) 100vw, 240px"
                className="scale-110 object-cover blur-md"
                aria-hidden="true"
              />
            ) : null}
            <Image
              src={thumbnail}
              alt={resource.link.title ?? ""}
              fill
              sizes="(max-width: 639px) 100vw, 240px"
              className={portrait ? "object-contain" : "object-cover"}
              // Only the foreground image reports failure; the blurred backdrop above
              // uses the same src, so one handler covers both.
              onError={() => setThumbnailFailed(true)}
            />
          </>
        ) : null}
      </a>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:gap-0 sm:py-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <SourceIcon resource={resource} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CatalogStatusChip resource={resource} />
            {resource.skill_level ? (
              <span className="inline-flex items-center rounded-pill bg-muted px-2.5 py-0.5 text-xs font-bold text-surface">
                {capitalize(resource.skill_level)}
              </span>
            ) : null}
          </div>
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring block transition hover:opacity-90"
        >
          <h3 className="line-clamp-2 text-lg font-bold leading-snug text-ink md:text-xl">
            {resource.link.title ?? url}
          </h3>
        </a>

        {resource.coach_take ? (
          <p className="line-clamp-2 text-sm leading-snug text-muted">
            <span className="font-bold text-ink">Coach&apos;s take:</span> {resource.coach_take}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            {contributor ? (
              <a
                href={`/contributors/${contributor.slug}`}
                className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-md bg-bgGroup px-2 py-1 text-xs font-bold text-muted transition hover:text-ink"
              >
                <UserRound className="h-3.5 w-3.5" />
                via @{contributor.slug}
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <a
              href={reportHref}
              aria-label="Report resource"
              title="Report resource"
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-bgGroup hover:text-ink"
            >
              <Flag className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => void onToggleWatched()}
              aria-label={isWatched ? "Mark not watched" : "Mark watched"}
              aria-pressed={isWatched}
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
            >
              <CircleCheck
                className={`h-5 w-5 ${isWatched ? "text-accent" : "text-muted"}`}
                fill={isWatched ? "currentColor" : "transparent"}
                stroke={isWatched ? "#ffffff" : "currentColor"}
                strokeWidth={2}
              />
            </button>
            <button
              type="button"
              onClick={() => void onToggleSaved()}
              aria-label={isSaved ? "Remove from Watch later" : "Add to Watch later"}
              aria-pressed={isSaved}
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
            >
              <SavedIcon
                className={`h-5 w-5 ${isSaved ? "text-accent" : "text-muted"}`}
                fill={isSaved ? "currentColor" : "transparent"}
                strokeWidth={2}
              />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onUpvote}
                aria-label={vote === 1 ? "Remove upvote" : "Upvote"}
                aria-pressed={vote === 1}
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
              >
                <ThumbsUp
                  className={`h-5 w-5 ${vote === 1 ? "text-accent" : "text-muted"}`}
                  fill={vote === 1 ? "currentColor" : "transparent"}
                  strokeWidth={2}
                />
              </button>
              {/* The aggregate score, Reddit-style: one number between the arrows,
                  always present, and it moves when you vote. This is combined_score
                  (coach curation + damped community votes) — the same value the list
                  is sorted by — not the net vote count, which is zero on all but a
                  handful of rows and so would render blank almost everywhere. */}
              {combinedScore !== null ? (
                <span
                  aria-live="polite"
                  aria-label={`Score ${formatAggregateScore(combinedScore)}, from coach review and community votes`}
                  title="Coach review + community votes"
                  className={`min-w-[1.75rem] text-center text-sm font-semibold tabular-nums transition-colors ${
                    vote === 1 ? "text-accent" : vote === -1 ? "text-ink" : "text-muted"
                  }`}
                >
                  {formatAggregateScore(combinedScore)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onDownvote}
                aria-label={vote === -1 ? "Remove downvote" : "Downvote"}
                aria-pressed={vote === -1}
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
              >
                <ThumbsDown
                  className={`h-5 w-5 ${vote === -1 ? "text-ink" : "text-muted"}`}
                  fill={vote === -1 ? "currentColor" : "transparent"}
                  strokeWidth={2}
                />
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
      </div>
    </article>
  );
}
