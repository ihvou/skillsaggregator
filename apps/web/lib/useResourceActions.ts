"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "./browserSupabase";

export type UserVoteState = -1 | 0 | 1;

function nextPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function signInHref() {
  return `/sign-in?next=${encodeURIComponent(nextPath())}`;
}

export function useResourceActions(relationId: string) {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [vote, setVote] = useState<UserVoteState>(0);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoaded(true);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.warn("resource_action_user_load_failed", userError.message);
    }

    setUserId(user?.id ?? null);
    if (!user) {
      setIsSaved(false);
      setIsWatched(false);
      setVote(0);
      setLoaded(true);
      return;
    }

    const [bookmarkResult, watchedResult, voteResult] = await Promise.all([
      supabase
        .from("user_bookmarks")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("link_skill_relation_id", relationId)
        .maybeSingle(),
      supabase
        .from("user_watched")
        .select("watched_at")
        .eq("user_id", user.id)
        .eq("link_skill_relation_id", relationId)
        .maybeSingle(),
      supabase
        .from("user_relation_votes")
        .select("vote")
        .eq("user_id", user.id)
        .eq("link_skill_relation_id", relationId)
        .maybeSingle(),
    ]);

    if (bookmarkResult.error) console.warn("resource_bookmark_load_failed", bookmarkResult.error.message);
    if (watchedResult.error) console.warn("resource_watched_load_failed", watchedResult.error.message);
    if (voteResult.error) console.warn("resource_vote_load_failed", voteResult.error.message);

    setIsSaved(Boolean(bookmarkResult.data));
    setIsWatched(Boolean(watchedResult.data));
    setVote(voteResult.data?.vote === -1 ? -1 : voteResult.data?.vote === 1 ? 1 : 0);
    setLoaded(true);
  }, [relationId, supabase]);

  useEffect(() => {
    let cancelled = false;
    refresh().catch((loadError) => {
      if (cancelled) return;
      console.warn("resource_actions_load_failed", loadError instanceof Error ? loadError.message : String(loadError));
      setLoaded(true);
    });

    if (!supabase) return () => {
      cancelled = true;
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (!cancelled) void refresh();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  const requireSignedIn = useCallback((action: string) => {
    setError(null);
    if (!supabase || !userId) {
      setPrompt(`Sign in to ${action}.`);
      return false;
    }
    setPrompt(null);
    return true;
  }, [supabase, userId]);

  const toggleSaved = useCallback(async () => {
    if (!requireSignedIn("save resources")) return;
    const next = !isSaved;
    setIsSaved(next);
    const { error: mutationError } = await supabase!.rpc("set_user_bookmark", {
      p_relation_id: relationId,
      p_saved: next,
    });
    if (mutationError) {
      setIsSaved(!next);
      setError(mutationError.message);
      console.warn("resource_bookmark_write_failed", { relationId, message: mutationError.message });
    }
  }, [isSaved, relationId, requireSignedIn, supabase]);

  const toggleWatched = useCallback(async () => {
    if (!requireSignedIn("mark resources watched")) return;
    const next = !isWatched;
    setIsWatched(next);
    const { error: mutationError } = await supabase!.rpc("set_user_watched", {
      p_relation_id: relationId,
      p_watched: next,
    });
    if (mutationError) {
      setIsWatched(!next);
      setError(mutationError.message);
      console.warn("resource_watched_write_failed", { relationId, message: mutationError.message });
    }
  }, [isWatched, relationId, requireSignedIn, supabase]);

  const setUserVote = useCallback(async (nextVote: UserVoteState) => {
    if (!requireSignedIn("vote on resources")) return;
    const previousVote = vote;
    setVote(nextVote);
    const { data, error: mutationError } = await supabase!
      .rpc("set_user_vote", {
        p_relation_id: relationId,
        p_vote: nextVote,
      })
      .single();
    if (mutationError) {
      setVote(previousVote);
      setError(mutationError.message);
      console.warn("resource_vote_write_failed", { relationId, vote: nextVote, message: mutationError.message });
      return;
    }
    const returnedVote = (data as { vote?: number | null } | null)?.vote;
    setVote(returnedVote === -1 ? -1 : returnedVote === 1 ? 1 : 0);
  }, [relationId, requireSignedIn, supabase, vote]);

  return {
    loaded,
    isSignedIn: Boolean(userId),
    isSaved,
    isWatched,
    vote,
    prompt,
    error,
    signInHref: signInHref(),
    toggleSaved,
    toggleWatched,
    setUserVote,
  };
}
