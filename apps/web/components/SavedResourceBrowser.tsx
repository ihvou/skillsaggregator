"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import type { SkillResource } from "@skillsaggregator/shared";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import { getBrowserSupabase } from "@/lib/browserSupabase";
import {
  type LibraryResourceRow,
  shapeLibraryResource,
} from "@/lib/resourceRows";

type LibraryView = "saved" | "watched";

export function SavedResourceBrowser() {
  const [view, setView] = useState<LibraryView>("saved");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [resources, setResources] = useState<SkillResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setSignedIn(false);
      setIsAnonymous(false);
      setResources([]);
      setLoading(false);
      setError("Library resources cannot be loaded until Supabase public env vars are available.");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) console.warn("library_session_load_failed", sessionError.message);
    const user = session?.user ?? null;
    setSignedIn(Boolean(user));
    setIsAnonymous(Boolean(user?.is_anonymous));
    setError(null);

    if (!user) {
      loadedKeyRef.current = null;
      setIsAnonymous(false);
      setResources([]);
      setLoading(false);
      return;
    }

    const idsKey = `${user.id}:${view}`;
    if (loadedKeyRef.current === idsKey) {
      setLoading(false);
      return;
    }
    if (inFlightKeyRef.current === idsKey) return;

    inFlightKeyRef.current = idsKey;
    setLoading(true);
    const { data, error: queryError } = await supabase.rpc("get_user_library_resources", {
      p_view: view,
    });

    if (inFlightKeyRef.current === idsKey) inFlightKeyRef.current = null;

    if (queryError) {
      setError(queryError.message);
      setResources([]);
      setLoading(false);
      return;
    }

    setResources(((data ?? []) as LibraryResourceRow[]).flatMap((row) => {
      const resource = shapeLibraryResource(row);
      return resource ? [resource] : [];
    }));
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

  function bookmarkId(resource: SkillResource) {
    return resource.personal_list_id ?? null;
  }

  async function persistSavedOrder(nextResources: SkillResource[], previousResources: SkillResource[]) {
    const supabase = getBrowserSupabase();
    const ids = nextResources.map(bookmarkId).filter((id): id is string => Boolean(id));
    if (!supabase || ids.length !== nextResources.length) return;
    setResources(nextResources);
    setError(null);
    const { error: reorderError } = await supabase.rpc("reorder_user_bookmarks", {
      p_bookmark_ids: ids,
    });
    if (reorderError) {
      setResources(previousResources);
      setError(reorderError.message);
      console.warn("library_reorder_failed", {
        message: reorderError.message,
        ids,
      });
      return;
    }
    console.info("library_reorder_saved", {
      count: ids.length,
    });
  }

  function moveDraggedResource(targetId: string | null) {
    if (view !== "saved" || !targetId) return;
    const draggedId = draggedIdRef.current;
    draggedIdRef.current = null;
    if (!draggedId || draggedId === targetId) return;
    const previousResources = resources;
    const from = previousResources.findIndex((resource) => bookmarkId(resource) === draggedId);
    const to = previousResources.findIndex((resource) => bookmarkId(resource) === targetId);
    if (from < 0 || to < 0) return;
    const nextResources = [...previousResources];
    const [moved] = nextResources.splice(from, 1);
    if (!moved) return;
    nextResources.splice(to, 0, moved);
    void persistSavedOrder(nextResources, previousResources);
  }

  return (
    <div className="pb-20">
      <PageHeader
        title="Library"
        subtitle="Watch later and watched resources tied to your private Subskills identity."
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
              {item === "saved" ? "Watch later" : "Watched"}
            </button>
          ))}
        </div>
        {loading ? <p className="text-sm text-muted">Loading {view === "saved" ? "Watch later" : view} resources...</p> : null}
        {!loading && error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!loading && !error && signedIn === false ? (
          <p className="text-sm text-muted">
            Save a resource, mark one watched, vote, or suggest a link to start a private library automatically.{" "}
            <Link className="focus-ring font-bold text-ink underline underline-offset-2" href="/sign-in?next=/saved">
              Add email or Google
            </Link>{" "}
            when you want to keep it across devices.
          </p>
        ) : null}
        {!loading && !error && signedIn && isAnonymous && resources.length > 0 ? (
          <p className="mb-5 rounded-md bg-bgGroup px-3 py-2 text-sm text-muted">
            This library is saved to this browser.{" "}
            <Link className="focus-ring font-bold text-ink underline underline-offset-2" href="/sign-in?next=/saved">
              Add email or Google
            </Link>{" "}
            to keep it if you change devices or clear browser data.
          </p>
        ) : null}
        {!loading && !error && signedIn && resources.length === 0 ? (
          <p className="text-sm text-muted">
            {view === "saved"
              ? "Your Watch later is empty. Use the bookmark button on any resource to keep it here."
              : "Nothing watched yet. Use the check button on a resource after you watch it."}
          </p>
        ) : null}
        {resources.length > 0 ? (
          <div className="divide-y divide-divider">
            {resources.map((resource) => {
              const id = bookmarkId(resource);
              const canReorder = view === "saved" && Boolean(id);
              return (
                <div
                  key={resource.id}
                  className="py-5"
                  draggable={canReorder}
                  onDragStart={() => {
                    draggedIdRef.current = id;
                  }}
                  onDragOver={(event) => {
                    if (canReorder) event.preventDefault();
                  }}
                  onDrop={() => moveDraggedResource(id)}
                >
                  <div className="flex gap-3">
                    {canReorder ? (
                      <span
                        className="mt-9 hidden cursor-grab text-faint sm:inline-flex"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-5 w-5" />
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <ResourceCard resource={resource} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
