"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "./browserSupabase";

const ACTION_TYPES = new Set(["saved", "completed", "upvote", "downvote"]);

function parseActionKey(key: string) {
  const [actionType, linkId] = key.split(":");
  if (!actionType || !linkId || !ACTION_TYPES.has(actionType)) return null;
  return { actionType, linkId };
}

async function writeUserAction(key: string, next: boolean) {
  const parsed = parseActionKey(key);
  const supabase = parsed ? getBrowserSupabase() : null;
  if (!parsed || !supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (next) {
    const { error } = await supabase
      .from("user_actions")
      .upsert(
        { user_id: user.id, link_id: parsed.linkId, action_type: parsed.actionType },
        { onConflict: "user_id,link_id,action_type", ignoreDuplicates: true },
      );
    if (error) console.warn("user_action_upsert_failed", error.message);
    return;
  }

  const { error } = await supabase
    .from("user_actions")
    .delete()
    .eq("user_id", user.id)
    .eq("link_id", parsed.linkId)
    .eq("action_type", parsed.actionType);
  if (error) console.warn("user_action_delete_failed", error.message);
}

/**
 * Browser-only per-key boolean flag persisted to localStorage. Mirrors the
 * mobile `getFlag`/`setFlag` so save / completed / upvote / downvote state
 * carries across page loads on the same device.
 *
 * Renders `false` on the server to avoid hydration mismatch — the real value
 * snaps in on the first client effect.
 */
export function useLocalFlag(key: string): readonly [boolean, () => void, (next: boolean) => void] {
  const [value, setValue] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      setValue(window.localStorage.getItem(key) === "1");
    } catch {
      // localStorage unavailable (e.g. private mode quota); silently treat as false.
    }

    const parsed = parseActionKey(key);
    const supabase = parsed ? getBrowserSupabase() : null;
    if (parsed && supabase) {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user || cancelled) return;
        const { data } = await supabase
          .from("user_actions")
          .select("action_type")
          .eq("user_id", user.id)
          .eq("link_id", parsed.linkId)
          .eq("action_type", parsed.actionType)
          .maybeSingle();
        if (!cancelled && data) setValue(true);
      }).catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        if (next) window.localStorage.setItem(key, "1");
        else window.localStorage.removeItem(key);
      } catch {
        // ignore quota / private-mode errors
      }
      void writeUserAction(key, next);
    },
    [key],
  );

  const toggle = useCallback(() => set(!value), [set, value]);

  return [value, toggle, set] as const;
}
