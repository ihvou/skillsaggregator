import Image from "next/image";
import { Globe, Music2, PlaySquare } from "lucide-react";
import { getLinkSource, type SkillResource } from "@skillsaggregator/shared";

interface ResourceTileProps {
  resource: SkillResource;
  /** Pixel width override. Default matches the shared 16/9 thumbnail size. */
  width?: number;
}

function isPortraitResource(resource: SkillResource) {
  return getLinkSource(resource.link) === "tiktok";
}

function SourceIcon({ resource }: { resource: SkillResource }) {
  const source = getLinkSource(resource.link);
  if (source === "youtube") return <PlaySquare className="h-3.5 w-3.5 text-[#ff0000]" />;
  if (source === "tiktok") return <Music2 className="h-3.5 w-3.5 text-ink" />;
  return <Globe className="h-3.5 w-3.5 text-faint" />;
}

/**
 * Pure-thumbnail tile for the Category page horizontal scroll rail.
 * 16/9 native YouTube proportions, same radius/shadow as the Skill-screen
 * card thumbnail. Click opens the link in a new tab.
 */
export function ResourceTile({ resource, width = 280 }: ResourceTileProps) {
  const portrait = isPortraitResource(resource);
  const height = Math.round((width * 9) / 16);
  return (
    <a
      href={resource.link.url}
      target="_blank"
      rel="noreferrer"
      className="focus-ring group block shrink-0 transition hover:opacity-90"
      style={{ width }}
      aria-label={resource.link.title ?? "Open resource"}
    >
      <div
        className="relative overflow-hidden rounded-[14px] bg-bgGroup shadow-thumb"
        style={{ width, height }}
      >
        {resource.link.thumbnail_url ? (
          <>
            {portrait ? (
              <Image
                src={resource.link.thumbnail_url}
                alt=""
                fill
                sizes={`${width}px`}
                className="scale-110 object-cover blur-md"
                aria-hidden="true"
              />
            ) : null}
            <Image
              src={resource.link.thumbnail_url}
              alt={resource.link.title ?? ""}
              fill
              sizes={`${width}px`}
              className={portrait ? "object-contain" : "object-cover"}
            />
          </>
        ) : null}
        <span className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 shadow-sm ring-1 ring-black/5">
          <SourceIcon resource={resource} />
        </span>
      </div>
    </a>
  );
}
