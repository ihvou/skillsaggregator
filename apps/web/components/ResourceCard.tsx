import Image from "next/image";
import { ExternalLink, ThumbsUp } from "lucide-react";
import type { SkillResource } from "@skillsaggregator/shared";

interface ResourceCardProps {
  resource: SkillResource;
}

export function ResourceCard({ resource }: ResourceCardProps) {
  const thumbnail = resource.link.thumbnail_url;

  return (
    <article className="grid gap-4 rounded-lg border border-ink/10 bg-white p-4 shadow-sm md:grid-cols-[180px_1fr]">
      <a
        href={resource.link.url}
        target="_blank"
        rel="noreferrer"
        className="focus-ring relative aspect-video overflow-hidden rounded-md bg-ink/10"
      >
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={resource.link.title ?? "Learning resource thumbnail"}
            fill
            sizes="(min-width: 768px) 180px, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-graphite">
            {resource.link.content_type ?? "resource"}
          </div>
        )}
      </a>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-graphite">
          <span>{resource.link.domain}</span>
          {resource.skill_level ? (
            <span className="rounded-full bg-amberline/10 px-2 py-1 text-amberline">
              {resource.skill_level}
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 text-lg font-semibold text-ink">
          <a
            href={resource.link.url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-2 hover:text-court"
          >
            {resource.link.title ?? resource.link.url}
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        </h3>
        {resource.public_note ? (
          <p className="mt-2 text-sm leading-6 text-graphite">{resource.public_note}</p>
        ) : null}
        {resource.link.description ? (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-graphite/80">
            {resource.link.description}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-2 text-sm text-graphite">
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          <span>{resource.upvote_count} approved upvotes</span>
        </div>
      </div>
    </article>
  );
}
