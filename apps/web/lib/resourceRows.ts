import type { ContributorProfileSummary, LinkResource, SkillResource, SkillSummary } from "@skillsaggregator/shared";
import { normalizeThumbnailUrl } from "./thumbnails";

export const RESOURCE_LINK_SELECT =
  "id, url, canonical_url, domain, title, description, thumbnail_url, thumbnail_storage_path, duration_seconds, like_count, comment_count, share_count, favorite_count, creator_handle, creator_url, scoring_strategy, content_type, created_at, contributor_profile:contributor_profiles(id, slug, display_name, avatar_url, accepted_count)";
export const RELATION_VOTE_SELECT = "upvote_count, downvote_count, vote_score, value_score, curator_score, curator_reviews";
export const SAVED_RELATION_SELECT = `id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, link_id, links!inner(${RESOURCE_LINK_SELECT}), skills!inner(id, slug, name, categories!inner(slug, name))`;

type MaybeArray<T> = T | T[] | null | undefined;

interface ContributorProfileRow {
  id: string;
  slug: string | null;
  display_name: string | null;
  avatar_url?: string | null;
  accepted_count?: number | null;
}

export interface RelationVoteRow {
  upvote_count?: number | null;
  downvote_count?: number | null;
  vote_score?: number | null;
  value_score?: number | null;
  curator_score?: number | null;
  curator_reviews?: number | null;
}

export interface LinkRow {
  id: string;
  url?: string | null;
  canonical_url?: string | null;
  domain?: string | null;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  thumbnail_storage_path?: string | null;
  duration_seconds?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  favorite_count?: number | null;
  creator_handle?: string | null;
  creator_url?: string | null;
  scoring_strategy?: string | null;
  content_type?: string | null;
  created_at?: string | null;
  contributor_profile?: MaybeArray<ContributorProfileRow>;
}

interface BaseRelationRow extends RelationVoteRow {
  id: string;
  public_note?: string | null;
  skill_level?: SkillResource["skill_level"];
  created_at?: string | null;
  links?: MaybeArray<LinkRow>;
}

export interface RelationWithSkillId extends BaseRelationRow {
  skill_id?: string | null;
}

interface JoinedSkillRow {
  id: string;
  slug: string;
  name: string;
  categories?: MaybeArray<{ slug: string; name: string | null }>;
}

export interface JoinedRelationRow extends BaseRelationRow {
  link_id?: string | null;
  skills?: MaybeArray<JoinedSkillRow>;
}

export function unwrapRow<T>(value: MaybeArray<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function shapeLinkWithContributor<TLink extends LinkRow>(link: TLink) {
  const contributor = unwrapRow(link.contributor_profile);
  const normalizedContributor: ContributorProfileSummary | null = contributor
    ? {
        id: contributor.id,
        slug: contributor.slug ?? "",
        display_name: contributor.display_name ?? "Contributor",
        avatar_url: contributor.avatar_url ?? null,
        accepted_count: contributor.accepted_count ?? 0,
      }
    : null;
  const url = link.url ?? link.canonical_url ?? "";
  return {
    ...link,
    url,
    canonical_url: link.canonical_url ?? url,
    domain: link.domain ?? "",
    title: link.title ?? null,
    description: link.description ?? null,
    thumbnail_url: normalizeThumbnailUrl(
      link.thumbnail_storage_path ?? link.thumbnail_url ?? null,
      link.canonical_url ?? url,
      link.thumbnail_storage_path ? link.thumbnail_url ?? null : null,
    ),
    ...(link.scoring_strategy === "transcript_llm" || link.scoring_strategy === "engagement_authority"
      ? { scoring_strategy: link.scoring_strategy }
      : {}),
    content_type:
      link.content_type === "video" ||
      link.content_type === "article" ||
      link.content_type === "podcast" ||
      link.content_type === "course"
        ? link.content_type
        : null,
    contributor_profile: normalizedContributor,
  } satisfies LinkResource;
}

export function relationVotes(relation: RelationVoteRow) {
  const upvoteCount = relation.upvote_count ?? 0;
  const downvoteCount = relation.downvote_count ?? 0;
  return {
    upvote_count: upvoteCount,
    downvote_count: downvoteCount,
    vote_score: relation.vote_score ?? Math.max(0, upvoteCount - downvoteCount),
    value_score: relation.value_score ?? null,
    curator_score: relation.curator_score ?? null,
    curator_reviews: relation.curator_reviews ?? null,
  };
}

export function shapeRelationResource(
  relation: RelationWithSkillId,
  skill: Pick<SkillSummary, "id" | "slug" | "name" | "category_slug"> & {
    category_name?: string | null;
  },
): SkillResource | null {
  const link = unwrapRow(relation.links);
  if (!link) return null;
  return {
    id: relation.id,
    public_note: relation.public_note ?? null,
    skill_level: relation.skill_level ?? null,
    ...relationVotes(relation),
    created_at: relation.created_at ?? link.created_at ?? null,
    link: shapeLinkWithContributor(link),
    skill: {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      category_slug: skill.category_slug,
      category_name: skill.category_name ?? null,
    },
  };
}

export function shapeJoinedRelationResource(relation: JoinedRelationRow): SkillResource | null {
  const link = unwrapRow(relation.links);
  if (!link) return null;
  const skill = unwrapRow(relation.skills);
  const category = skill ? unwrapRow(skill.categories) : null;
  const resource: SkillResource = {
    id: relation.id,
    public_note: relation.public_note ?? null,
    skill_level: relation.skill_level ?? null,
    ...relationVotes(relation),
    created_at: relation.created_at ?? link.created_at ?? null,
    link: shapeLinkWithContributor(link),
  };
  if (skill) {
    resource.skill = {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      category_slug: category?.slug ?? "",
      category_name: category?.name ?? null,
    };
  }
  return resource;
}
