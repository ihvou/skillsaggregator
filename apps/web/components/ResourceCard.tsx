"use client";

import Image from "next/image";
import Link from "next/link";
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
} from "lucide-react";
import { getLinkSource, resourceQualityRating, type SkillResource } from "@skillsaggregator/shared";
import { useResourceActions } from "@/lib/useResourceActions";

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

function isPortraitResource(resource: SkillResource) {
  return getLinkSource(resource.link) === "tiktok";
}

function SourceIcon({ resource }: { resource: SkillResource }) {
  const source = getLinkSource(resource.link);
  if (source === "youtube") return <PlaySquare className="h-4 w-4 text-[#ff0000]" />;
  if (source === "tiktok") return <Music2 className="h-4 w-4 text-ink" />;
  return <Globe className="h-4 w-4 text-faint" />;
}

/**
 * Web counterpart to the mobile ResourceCard row.
 *  - 16/9 thumbnail (left, click → opens link)
 *  - Source + date + level pill (top), bold 2-line title (clickable),
 *    quality badge + watched/saved/vote actions.
 *  - State (save / watched / vote) is authenticated and stored server-side.
 */
export function ResourceCard({ resource }: ResourceCardProps) {
  const relationId = resource.id;
  const {
    isSaved,
    isWatched,
    vote,
    prompt,
    error,
    signInHref,
    toggleSaved,
    toggleWatched,
    setUserVote,
  } = useResourceActions(relationId);

  const dateLabel = formatDate(resource.created_at);
  const thumbnail = resource.link.thumbnail_url;
  const portrait = isPortraitResource(resource);
  const url = resource.link.url;
  const contributor = resource.link.contributor_profile;
  const quality = resourceQualityRating(resource);

  function onUpvote() {
    void setUserVote(vote === 1 ? 0 : 1);
  }
  function onDownvote() {
    void setUserVote(vote === -1 ? 0 : -1);
  }

  const SavedIcon = isSaved ? BookmarkCheck : Bookmark;

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
            />
          </>
        ) : null}
      </a>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:gap-0 sm:py-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <SourceIcon resource={resource} />
            {dateLabel ? <span className="text-sm text-muted">{dateLabel}</span> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {quality ? (
              <span className="inline-flex items-center rounded-pill bg-accent/12 px-2.5 py-0.5 text-xs font-bold text-accent">
                {quality.label} {quality.percent}%
              </span>
            ) : (
              <span className="inline-flex items-center rounded-pill bg-bgGroup px-2.5 py-0.5 text-xs font-bold text-muted">
                Quality pending
              </span>
            )}
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
            <button
              type="button"
              onClick={() => void toggleWatched()}
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
              onClick={() => void toggleSaved()}
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
        {prompt || error ? (
          <p className={`text-xs font-bold ${error ? "text-red-600" : "text-muted"}`}>
            {error ? error : <Link className="focus-ring underline underline-offset-2" href={signInHref}>{prompt}</Link>}
          </p>
        ) : null}
      </div>
    </article>
  );
}
