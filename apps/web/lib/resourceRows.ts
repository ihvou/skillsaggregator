import type { ContributorProfileSummary, LinkResource, SkillResource, SkillSummary } from "@skillsaggregator/shared";
import { normalizeThumbnailUrl } from "./thumbnails";

export const RESOURCE_LINK_SELECT =
  "id, url, canonical_url, domain, title, description, thumbnail_url, thumbnail_storage_path, duration_seconds, like_count, comment_count, share_count, favorite_count, creator_handle, creator_url, scoring_strategy, content_type, created_at, contributor_profile:contributor_profiles(id, slug, display_name, avatar_url, accepted_count)";
export const RELATION_VOTE_SELECT = "upvote_count, downvote_count, vote_score, value_score, curator_score, curator_reviews, user_score, combined_score, coach_take";
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
  user_score?: number | null;
  combined_score?: number | null;
  coach_take?: string | null;
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

export interface LibraryResourceRow extends RelationVoteRow {
  library_view?: "saved" | "watched" | string | null;
  bookmark_id?: string | null;
  list_sort_order?: number | string | null;
  library_added_at?: string | null;
  watched_at?: string | null;
  catalog_status?: SkillResource["catalog_status"];
  link_skill_relation_id?: string | null;
  relation_published?: boolean | null;
  suggestion_status?: SkillResource["suggestion_status"];
  public_note?: string | null;
  skill_level?: SkillResource["skill_level"];
  relation_created_at?: string | null;
  link_id: string;
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
  link_created_at?: string | null;
  contributor_profile_id?: string | null;
  contributor_slug?: string | null;
  contributor_display_name?: string | null;
  contributor_avatar_url?: string | null;
  contributor_accepted_count?: number | null;
  skill_id?: string | null;
  skill_slug?: string | null;
  skill_name?: string | null;
  category_slug?: string | null;
  category_name?: string | null;
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
    user_score: relation.user_score ?? null,
    combined_score: relation.combined_score ?? relation.curator_score ?? null,
    coach_take: relation.coach_take ?? null,
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
    link_skill_relation_id: relation.id,
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
    link_skill_relation_id: relation.id,
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

function normalizeCatalogStatus(value: LibraryResourceRow["catalog_status"]) {
  return value === "private" || value === "in_review" || value === "in_catalog" || value === "not_added"
    ? value
    : null;
}

function numericSortOrder(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function shapeLibraryResource(row: LibraryResourceRow): SkillResource | null {
  if (!row.link_id) return null;
  const contributor = row.contributor_profile_id
    ? {
        id: row.contributor_profile_id,
        slug: row.contributor_slug ?? "",
        display_name: row.contributor_display_name ?? "Contributor",
        avatar_url: row.contributor_avatar_url ?? null,
        accepted_count: row.contributor_accepted_count ?? 0,
      }
    : null;
  const resource: SkillResource = {
    id: row.bookmark_id ?? row.link_skill_relation_id ?? row.link_id,
    link_skill_relation_id: row.link_skill_relation_id ?? null,
    personal_list_id: row.bookmark_id ?? null,
    catalog_status: normalizeCatalogStatus(row.catalog_status),
    list_sort_order: numericSortOrder(row.list_sort_order),
    suggestion_status: row.suggestion_status ?? null,
    relation_published: row.relation_published ?? null,
    public_note: row.public_note ?? null,
    skill_level: row.skill_level ?? null,
    ...relationVotes(row),
    created_at: row.relation_created_at ?? row.link_created_at ?? row.library_added_at ?? null,
    link: shapeLinkWithContributor({
      id: row.link_id,
      url: row.url ?? row.canonical_url ?? "",
      canonical_url: row.canonical_url ?? row.url ?? "",
      domain: row.domain ?? "",
      title: row.title ?? null,
      description: row.description ?? null,
      thumbnail_url: row.thumbnail_url ?? null,
      thumbnail_storage_path: row.thumbnail_storage_path ?? null,
      duration_seconds: row.duration_seconds ?? null,
      like_count: row.like_count ?? null,
      comment_count: row.comment_count ?? null,
      share_count: row.share_count ?? null,
      favorite_count: row.favorite_count ?? null,
      creator_handle: row.creator_handle ?? null,
      creator_url: row.creator_url ?? null,
      scoring_strategy: row.scoring_strategy ?? null,
      content_type: row.content_type ?? null,
      created_at: row.link_created_at ?? null,
      contributor_profile: contributor,
    }),
  };
  if (row.skill_id && row.skill_slug && row.skill_name) {
    resource.skill = {
      id: row.skill_id,
      slug: row.skill_slug,
      name: row.skill_name,
      category_slug: row.category_slug ?? "",
      category_name: row.category_name ?? null,
    };
  }
  return resource;
}
