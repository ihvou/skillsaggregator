export type SkillLevel = "beginner" | "intermediate" | "advanced";
export type ResourceSort = "newest" | "popular";

export type SuggestionType =
  | "LINK_ADD"
  | "LINK_ATTACH_SKILL"
  | "LINK_DETACH_SKILL"
  | "LINK_UPVOTE_SKILL"
  | "SKILL_CREATE"
  | "SKILL_DELETE";

export type SuggestionStatus = "pending" | "approved" | "declined" | "auto_approved";

export type OriginType = "agent" | "admin" | "human" | "import";

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at?: string | null;
}

export interface SkillSummary {
  id: string;
  category_id: string;
  category_slug: string;
  slug: string;
  name: string;
  description: string | null;
  resource_count: number;
  updated_at?: string | null;
}

export interface LinkResource {
  id: string;
  url: string;
  canonical_url: string;
  domain: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  content_type: "video" | "article" | "podcast" | "course" | null;
  created_at?: string | null;
}

export interface SkillResource {
  id: string;
  public_note: string | null;
  skill_level: SkillLevel | null;
  upvote_count: number;
  created_at?: string | null;
  link: LinkResource;
  skill?: Pick<SkillSummary, "id" | "slug" | "name" | "category_slug"> & {
    category_name?: string | null;
  };
}

export interface TriangulationVote {
  model: string;
  approve: boolean;
  confidence: number;
  reason: string;
}

export interface ScoreResult {
  relevance: number;
  teaching_quality: number;
  demo_vs_talk: number;
  level: SkillLevel;
  public_note: string;
  evidence_quote: string;
}
