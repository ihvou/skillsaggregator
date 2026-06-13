import type {
  LinkResource,
  ResourceSource,
  ResourceSourceFilter,
  SkillResource,
} from "./types";

type SourceLink = Pick<
  LinkResource,
  "domain" | "url" | "canonical_url" | "thumbnail_storage_path"
>;

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

export function getLinkSource(link: SourceLink): ResourceSource {
  const haystack = [
    link.domain,
    link.url,
    link.canonical_url,
    link.thumbnail_storage_path,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(haystack, ["tiktok.com", "/tiktok/"])) return "tiktok";
  if (includesAny(haystack, ["youtube.com", "youtu.be", "ytimg.com"])) return "youtube";
  return "other";
}

export function resourceMatchesSource(
  resource: Pick<SkillResource, "link">,
  source: ResourceSourceFilter,
) {
  return source === "all" || getLinkSource(resource.link) === source;
}

export function resourceValueScore(
  resource: Pick<SkillResource, "value_score" | "vote_score" | "upvote_count">,
) {
  if (typeof resource.value_score === "number" && Number.isFinite(resource.value_score)) {
    return resource.value_score;
  }
  if (typeof resource.vote_score === "number" && Number.isFinite(resource.vote_score)) {
    return resource.vote_score;
  }
  return Number.isFinite(resource.upvote_count) ? resource.upvote_count : 0;
}
