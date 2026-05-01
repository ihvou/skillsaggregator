import { suggestionPayloadByType } from "./schemas.ts";
import { normalizeCanonicalUrl, normalizeSkillName } from "./normalization.ts";

export function buildDedupeKey(
  type:
    | "LINK_ADD"
    | "LINK_ATTACH_SKILL"
    | "LINK_DETACH_SKILL"
    | "LINK_UPVOTE_SKILL"
    | "SKILL_CREATE"
    | "SKILL_DELETE",
  payload: unknown,
  authorInternalUserId?: string | null,
): string {
  const parsed = suggestionPayloadByType[type].parse(payload) as Record<string, string>;
  const requireValue = (key: string) => {
    const value = parsed[key];
    if (!value) throw new Error(`Missing ${key} for ${type}`);
    return value;
  };

  switch (type) {
    case "LINK_ADD":
      return [
        "LINK_ADD",
        normalizeCanonicalUrl(requireValue("canonical_url")),
        requireValue("target_skill_id"),
      ].join(":");
    case "LINK_ATTACH_SKILL":
      return ["LINK_ATTACH_SKILL", requireValue("link_id"), requireValue("target_skill_id"), "attach"].join(":");
    case "LINK_DETACH_SKILL":
      return ["LINK_DETACH_SKILL", requireValue("link_id"), requireValue("target_skill_id"), "detach"].join(":");
    case "LINK_UPVOTE_SKILL":
      return [
        "LINK_UPVOTE_SKILL",
        requireValue("link_id"),
        requireValue("target_skill_id"),
        authorInternalUserId ?? "unknown-author",
        "upvote",
      ].join(":");
    case "SKILL_CREATE":
      return ["SKILL_CREATE", requireValue("category_id"), normalizeSkillName(requireValue("name"))].join(":");
    case "SKILL_DELETE":
      return ["SKILL_DELETE", requireValue("skill_id"), "delete"].join(":");
  }
}
