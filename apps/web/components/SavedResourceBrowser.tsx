"use client";

import { useCallback, useEffect, useState } from "react";
import type { SkillResource } from "@skillsaggregator/shared";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import { getBrowserSupabase } from "@/lib/browserSupabase";
import { normalizeThumbnailUrl } from "@/lib/thumbnails";

const RESOURCE_LINK_SELECT =
  "id, url, canonical_url, domain, title, description, thumbnail_url, thumbnail_storage_path, duration_seconds, like_count, comment_count, share_count, favorite_count, creator_handle, creator_url, scoring_strategy, content_type, created_at, contributor_profile:contributor_profiles(id, slug, display_name, avatar_url, accepted_count)";
const RELATION_SELECT = `id, public_note, skill_level, upvote_count, downvote_count, vote_score, value_score, created_at, link_id, links!inner(${RESOURCE_LINK_SELECT}), skills!inner(id, slug, name, categories!inner(slug, name))`;

function readSavedIds() {
  try {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith("saved:") && window.localStorage.getItem(key) === "1")
      .map((key) => key.replace("saved:", ""));
  } catch {
    return [];
  }
}

function relationVotes(relation: {
  upvote_count?: number | null;
  downvote_count?: number | null;
  vote_score?: number | null;
  value_score?: number | null;
}) {
  const upvoteCount = relation.upvote_count ?? 0;
  const downvoteCount = relation.downvote_count ?? 0;
  return {
    upvote_count: upvoteCount,
    downvote_count: downvoteCount,
    vote_score: relation.vote_score ?? Math.max(0, upvoteCount - downvoteCount),
    value_score: relation.value_score ?? null,
  };
}

function shapeLink<TLink extends {
  contributor_profile?: unknown;
  thumbnail_url?: string | null;
  thumbnail_storage_path?: string | null;
  canonical_url?: string | null;
  url?: string | null;
}>(link: TLink) {
  const contributor = Array.isArray(link.contributor_profile)
    ? link.contributor_profile[0]
    : link.contributor_profile;
  return {
    ...link,
    thumbnail_url: normalizeThumbnailUrl(
      link.thumbnail_storage_path ?? link.thumbnail_url,
      link.canonical_url ?? link.url ?? null,
      link.thumbnail_storage_path ? link.thumbnail_url : null,
    ),
    contributor_profile: contributor ?? null,
  };
}

export function SavedResourceBrowser() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [resources, setResources] = useState<SkillResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const ids = readSavedIds();
    setSavedIds(ids);
    setError(null);
    if (ids.length === 0) {
      setResources([]);
      setLoading(false);
      return;
    }

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setResources([]);
      setLoading(false);
      setError("Saved resources cannot be loaded until Supabase public env vars are available.");
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("link_skill_relations")
      .select(RELATION_SELECT)
      .in("link_id", ids)
      .eq("is_active", true)
      .eq("links.is_active", true)
      .order("vote_score", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setResources([]);
      setLoading(false);
      return;
    }

    const byLink = new Map<string, SkillResource>();
    for (const relation of data ?? []) {
      if (byLink.has(relation.link_id)) continue;
      const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
      if (!link) continue;
      const skill = Array.isArray(relation.skills) ? relation.skills[0] : relation.skills;
      const category = skill
        ? Array.isArray(skill.categories)
          ? skill.categories[0]
          : skill.categories
        : null;
      const resource: SkillResource = {
        id: relation.id,
        public_note: relation.public_note,
        skill_level: relation.skill_level,
        ...relationVotes(relation),
        created_at: relation.created_at ?? link.created_at ?? null,
        link: shapeLink(link),
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
      byLink.set(relation.link_id, resource);
    }

    setResources(ids.map((id) => byLink.get(id)).filter((item): item is SkillResource => Boolean(item)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    function onStorage(event: StorageEvent) {
      if (!event.key || event.key.startsWith("saved:")) void refresh();
    }
    function onFocus() {
      void refresh();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <div className="pb-20">
      <PageHeader
        title="Saved"
        subtitle="Your library on this device."
        backHref="/"
        rightAccessory={<SuggestLinkButton />}
      />

      <section className="mx-auto mt-10 max-w-5xl px-4">
        {loading ? <p className="text-sm text-muted">Loading saved resources...</p> : null}
        {!loading && error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!loading && !error && savedIds.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing saved yet. Use the bookmark button on any resource to keep it here.
          </p>
        ) : null}
        {!loading && !error && savedIds.length > 0 && resources.length === 0 ? (
          <p className="text-sm text-muted">Saved resources were not found in the active catalog.</p>
        ) : null}
        {resources.length > 0 ? (
          <div className="divide-y divide-divider">
            {resources.map((resource) => (
              <div key={resource.id} className="py-5">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
