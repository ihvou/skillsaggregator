"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillResource } from "@skillsaggregator/shared";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import { getBrowserSupabase } from "@/lib/browserSupabase";
import {
  type JoinedRelationRow,
  SAVED_RELATION_SELECT,
  shapeJoinedRelationResource,
} from "@/lib/resourceRows";

function readSavedIds() {
  try {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith("saved:") && window.localStorage.getItem(key) === "1")
      .map((key) => key.replace("saved:", ""));
  } catch {
    return [];
  }
}

export function SavedResourceBrowser() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [resources, setResources] = useState<SkillResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const ids = readSavedIds();
    const idsKey = ids.join("\u0000");
    setSavedIds(ids);
    setError(null);
    if (loadedKeyRef.current === idsKey) {
      setLoading(false);
      return;
    }
    if (inFlightKeyRef.current === idsKey) return;
    if (ids.length === 0) {
      loadedKeyRef.current = idsKey;
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

    inFlightKeyRef.current = idsKey;
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("link_skill_relations")
      .select(SAVED_RELATION_SELECT)
      .in("link_id", ids)
      .eq("is_active", true)
      .eq("published", true)
      .eq("links.is_active", true)
      .order("curator_score", { ascending: false, nullsFirst: false })
      .order("curator_reviews", { ascending: false, nullsFirst: false })
      .order("value_score", { ascending: false, nullsFirst: false })
      .order("vote_score", { ascending: false });

    if (inFlightKeyRef.current === idsKey) inFlightKeyRef.current = null;

    if (queryError) {
      setError(queryError.message);
      setResources([]);
      setLoading(false);
      return;
    }

    if (readSavedIds().join("\u0000") !== idsKey) return;

    const byLink = new Map<string, SkillResource>();
    for (const relation of (data ?? []) as JoinedRelationRow[]) {
      if (!relation.link_id) continue;
      if (byLink.has(relation.link_id)) continue;
      const resource = shapeJoinedRelationResource(relation);
      if (!resource) continue;
      byLink.set(relation.link_id, resource);
    }

    setResources(ids.map((id) => byLink.get(id)).filter((item): item is SkillResource => Boolean(item)));
    loadedKeyRef.current = idsKey;
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
