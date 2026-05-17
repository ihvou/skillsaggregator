import Image from "next/image";
import Link from "next/link";
import type { SkillSummary } from "@skillsaggregator/shared";

interface SkillTileProps {
  skill: SkillSummary;
  thumbnailUrl: string | null;
  /** Pixel width override. Default matches the shared 16/9 thumbnail size. */
  width?: number;
}

/**
 * Home-screen tile representing a SKILL.
 *  - Uses the latest resource's thumbnail as background
 *  - Dark scrim + centered white skill name overlay
 *  - Native 16/9 proportions (same as ResourceCard / ResourceTile)
 */
export function SkillTile({ skill, thumbnailUrl, width = 280 }: SkillTileProps) {
  const height = Math.round((width * 9) / 16);
  return (
    <Link
      href={`/${skill.category_slug}/${skill.slug}`}
      className="focus-ring group block shrink-0 transition hover:opacity-90"
      style={{ width }}
    >
      <div
        className="relative overflow-hidden rounded-[14px] bg-bgGroup shadow-thumb"
        style={{ width, height }}
      >
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={skill.name}
            fill
            sizes={`${width}px`}
            className="object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex items-center justify-center px-3">
          <span
            className="text-center text-lg font-extrabold leading-tight text-white"
            style={{ textShadow: "0 1px 5px rgba(0,0,0,0.45)" }}
          >
            {skill.name}
          </span>
        </div>
      </div>
    </Link>
  );
}
