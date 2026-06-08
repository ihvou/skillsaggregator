"use client";

import Image from "next/image";
import { useMemo } from "react";
import {
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import type { SkillResource } from "@skillsaggregator/shared";
import { useLocalFlag } from "@/lib/useLocalFlag";

interface ResourceCardProps {
  resource: SkillResource;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const rounded = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1);
    return `${value < 0 ? "-" : ""}${rounded}k`;
  }
  return String(value);
}

function isPortraitResource(resource: SkillResource) {
  const domain = resource.link.domain?.toLowerCase() ?? "";
  return domain.includes("tiktok") || resource.link.thumbnail_storage_path?.includes("/tiktok/") === true;
}

/**
 * Web counterpart to the mobile ResourceCard row.
 *  - 16/9 thumbnail (left, click → opens link)
 *  - Date + level pill (top), bold 2-line title (clickable), domain +
 *    watched + saved + thumbs-up + rating count + thumbs-down (bottom)
 *  - State (save / watched / vote) persisted to localStorage so it sticks
 *    across page loads on the same device, same keys as mobile
 *
 * Logged-in users also write these flags through to `user_actions`; anonymous
 * users keep the same local-only behavior.
 */
export function ResourceCard({ resource }: ResourceCardProps) {
  const linkId = resource.link.id;
  const relationId = resource.id;
  const [isSaved, toggleSaved] = useLocalFlag(`saved:${linkId}`);
  const [isCompleted, toggleCompleted] = useLocalFlag(`completed:${linkId}`);
  const [upvoted, , setUpvoted] = useLocalFlag(`upvote:${linkId}:${relationId}`);
  const [downvoted, , setDownvoted] = useLocalFlag(`downvote:${linkId}:${relationId}`);

  const dateLabel = formatDate(resource.created_at);
  const thumbnail = resource.link.thumbnail_url;
  const portrait = isPortraitResource(resource);
  const url = resource.link.url;
  const contributor = resource.link.contributor_profile;

  function onUpvote() {
    const next = !upvoted;
    setUpvoted(next);
    if (next && downvoted) setDownvoted(false);
  }
  function onDownvote() {
    const next = !downvoted;
    setDownvoted(next);
    if (next && upvoted) setUpvoted(false);
  }

  const ratingCount = useMemo(() => {
    const upvoteCount = Number.isFinite(resource.upvote_count) ? resource.upvote_count : 0;
    const downvoteCount = Number.isFinite(resource.downvote_count) ? (resource.downvote_count ?? 0) : 0;
    const base = Number.isFinite(resource.vote_score)
      ? (resource.vote_score ?? 0)
      : Math.max(0, upvoteCount - downvoteCount);
    return Math.max(0, base + (upvoted ? 1 : 0) - (downvoted ? 1 : 0));
  }, [resource.upvote_count, resource.downvote_count, resource.vote_score, upvoted, downvoted]);

  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;
  const ratingColor = upvoted
    ? "text-accent"
    : downvoted
      ? "text-ink"
      : "text-muted";

  return (
    <article className="flex items-stretch gap-4">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={resource.link.title ?? "Open resource"}
        className="focus-ring relative shrink-0 overflow-hidden rounded-[14px] bg-bgGroup shadow-thumb transition hover:opacity-90"
        style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9", width: portrait ? 108 : 240 }}
      >
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={resource.link.title ?? ""}
            fill
            sizes={portrait ? "108px" : "240px"}
            className="object-cover"
          />
        ) : null}
      </a>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <div className="flex items-center justify-between gap-2">
          {dateLabel ? <span className="text-sm text-muted">{dateLabel}</span> : <span />}
          {resource.skill_level ? (
            <span className="inline-flex items-center rounded-pill bg-muted px-2.5 py-0.5 text-xs font-bold text-surface">
              {capitalize(resource.skill_level)}
            </span>
          ) : null}
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

        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-faint">{resource.link.domain}</span>
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
            <button
              type="button"
              onClick={toggleCompleted}
              aria-label={isCompleted ? "Mark not watched" : "Mark watched"}
              aria-pressed={isCompleted}
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
            >
              <CircleCheck
                className={`h-5 w-5 ${isCompleted ? "text-accent" : "text-muted"}`}
                fill={isCompleted ? "currentColor" : "transparent"}
                stroke={isCompleted ? "#ffffff" : "currentColor"}
                strokeWidth={2}
              />
            </button>
            <button
              type="button"
              onClick={toggleSaved}
              aria-label={isSaved ? "Unsave resource" : "Save resource"}
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
                aria-label={upvoted ? "Remove upvote" : "Upvote"}
                aria-pressed={upvoted}
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
              >
                <ThumbsUp
                  className={`h-5 w-5 ${upvoted ? "text-accent" : "text-muted"}`}
                  fill={upvoted ? "currentColor" : "transparent"}
                  strokeWidth={2}
                />
              </button>
              <span className={`min-w-[1.25rem] text-center text-xs font-bold ${ratingColor}`}>
                {formatCount(ratingCount)}
              </span>
              <button
                type="button"
                onClick={onDownvote}
                aria-label={downvoted ? "Remove downvote" : "Downvote"}
                aria-pressed={downvoted}
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bgGroup"
              >
                <ThumbsDown
                  className={`h-5 w-5 ${downvoted ? "text-ink" : "text-muted"}`}
                  fill={downvoted ? "currentColor" : "transparent"}
                  strokeWidth={2}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
