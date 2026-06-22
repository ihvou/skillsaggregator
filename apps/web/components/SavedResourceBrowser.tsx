"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

type LibraryView = "saved" | "watched";

export function SavedResourceBrowser() {
  const [view, setView] = useState<LibraryView>("saved");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [relationIds, setRelationIds] = useState<string[]>([]);
  const [resources, setResources] = useState<SkillResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setSignedIn(false);
      setResources([]);
      setRelationIds([]);
      setLoading(false);
      setError("Saved resources cannot be loaded until Supabase public env vars are available.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) console.warn("library_user_load_failed", userError.message);
    setSignedIn(Boolean(user));
    setError(null);

    if (!user) {
      loadedKeyRef.current = null;
      setRelationIds([]);
      setResources([]);
      setLoading(false);
      return;
    }

    const table = view === "saved" ? "user_bookmarks" : "user_watched";
    const orderColumn = view === "saved" ? "created_at" : "watched_at";
    const { data: stateRows, error: stateError } = await supabase
      .from(table)
      .select(`link_skill_relation_id, ${orderColumn}`)
      .eq("user_id", user.id)
      .order(orderColumn, { ascending: false });

    if (stateError) {
      setError(stateError.message);
      setResources([]);
      setRelationIds([]);
      setLoading(false);
      return;
    }

    const ids = (stateRows ?? [])
      .map((row) => row.link_skill_relation_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const idsKey = `${view}:${ids.join("\u0000")}`;
    setRelationIds(ids);
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

    inFlightKeyRef.current = idsKey;
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("link_skill_relations")
      .select(SAVED_RELATION_SELECT)
      .in("id", ids)
      .eq("is_active", true)
      .eq("published", true)
      .eq("links.is_active", true)
      .order("combined_score", { ascending: false, nullsFirst: false })
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

    const byRelation = new Map<string, SkillResource>();
    for (const relation of (data ?? []) as JoinedRelationRow[]) {
      if (byRelation.has(relation.id)) continue;
      const resource = shapeJoinedRelationResource(relation);
      if (!resource) continue;
      byRelation.set(relation.id, resource);
    }

    setResources(ids.map((id) => byRelation.get(id)).filter((item): item is SkillResource => Boolean(item)));
    loadedKeyRef.current = idsKey;
    setLoading(false);
  }, [view]);

  useEffect(() => {
    void refresh();
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);

    const supabase = getBrowserSupabase();
    const authListener = supabase?.auth.onAuthStateChange(() => {
      loadedKeyRef.current = null;
      void refresh();
    });
    const subscription = authListener?.data.subscription;

    return () => {
      window.removeEventListener("focus", onFocus);
      subscription?.unsubscribe();
    };
  }, [refresh]);

  return (
    <div className="pb-20">
      <PageHeader
        title="Library"
        subtitle="Saved and watched resources tied to your account."
        backHref="/"
        rightAccessory={<SuggestLinkButton />}
      />

      <section className="mx-auto mt-10 max-w-5xl px-4">
        <div className="mb-6 inline-flex rounded-lg bg-bgGroup p-1">
          {(["saved", "watched"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                loadedKeyRef.current = null;
                setView(item);
              }}
              className={`focus-ring rounded-md px-4 py-2 text-sm font-bold capitalize transition ${
                view === item ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        {loading ? <p className="text-sm text-muted">Loading {view} resources...</p> : null}
        {!loading && error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!loading && !error && signedIn === false ? (
          <p className="text-sm text-muted">
            <Link className="focus-ring font-bold text-ink underline underline-offset-2" href="/sign-in?next=/saved">
              Sign in
            </Link>{" "}
            to save resources, mark them watched, and keep your library across devices.
          </p>
        ) : null}
        {!loading && !error && signedIn && relationIds.length === 0 ? (
          <p className="text-sm text-muted">
            {view === "saved"
              ? "Nothing saved yet. Use the bookmark button on any resource to keep it here."
              : "Nothing watched yet. Use the check button on a resource after you watch it."}
          </p>
        ) : null}
        {!loading && !error && relationIds.length > 0 && resources.length === 0 ? (
          <p className="text-sm text-muted">Library resources were not found in the active catalog.</p>
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
