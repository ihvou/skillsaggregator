import Image from "next/image";
import type { SkillResource } from "@skillsaggregator/shared";

interface ResourceTileProps {
  resource: SkillResource;
  /** Pixel width override. Default matches the shared 16/9 thumbnail size. */
  width?: number;
}

/**
 * Pure-thumbnail tile for the Category page horizontal scroll rail.
 * 16/9 native YouTube proportions, same radius/shadow as the Skill-screen
 * card thumbnail. Click opens the link in a new tab.
 */
export function ResourceTile({ resource, width = 280 }: ResourceTileProps) {
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
          <Image
            src={resource.link.thumbnail_url}
            alt={resource.link.title ?? ""}
            fill
            sizes={`${width}px`}
            className="object-cover"
          />
        ) : null}
      </div>
    </a>
  );
}
