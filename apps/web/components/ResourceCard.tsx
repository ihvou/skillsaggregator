import Image from "next/image";
import type { SkillResource } from "@skillsaggregator/shared";

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

/**
 * Web counterpart to the mobile ResourceCard row.
 *  - 16/9 thumbnail on the left, stretches to body height
 *  - Right column: top meta (date + level pill), 2-line title,
 *    bottom meta (domain + ratings count)
 *  - Click anywhere opens the link in a new tab
 *
 * Action icons (save / complete / vote) live on mobile only — the web
 * surface for those is a future logged-in pass (W2).
 */
export function ResourceCard({ resource }: ResourceCardProps) {
  const thumbnail = resource.link.thumbnail_url;
  const dateLabel = formatDate(resource.created_at);

  return (
    <article className="group">
      <a
        href={resource.link.url}
        target="_blank"
        rel="noreferrer"
        className="focus-ring flex items-stretch gap-4 transition hover:opacity-90"
      >
        <div
          className="relative shrink-0 overflow-hidden rounded-[14px] bg-bgGroup shadow-thumb"
          style={{ aspectRatio: "16 / 9", width: 240 }}
        >
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={resource.link.title ?? ""}
              fill
              sizes="240px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
          <div className="flex items-center justify-between gap-2">
            {dateLabel ? <span className="text-sm text-muted">{dateLabel}</span> : <span />}
            {resource.skill_level ? (
              <span className="inline-flex items-center rounded-pill bg-muted px-2.5 py-0.5 text-xs font-bold text-surface">
                {capitalize(resource.skill_level)}
              </span>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-lg font-bold leading-snug text-ink md:text-xl">
            {resource.link.title ?? resource.link.url}
          </h3>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-faint">{resource.link.domain}</span>
            <span className="text-muted">
              {resource.upvote_count} {resource.upvote_count === 1 ? "rating" : "ratings"}
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
