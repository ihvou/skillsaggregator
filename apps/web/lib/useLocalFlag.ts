"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "./browserSupabase";

const ACTION_TYPES = new Set(["saved", "completed", "upvote", "downvote"]);
const VOTE_ACTION_TYPES = new Set(["upvote", "downvote"]);

function parseActionKey(key: string) {
  const [actionType, linkId, linkSkillRelationId] = key.split(":");
  if (!actionType || !linkId || !ACTION_TYPES.has(actionType)) return null;
  return { actionType, linkId, linkSkillRelationId: linkSkillRelationId ?? null };
}

function canWriteAction(parsed: NonNullable<ReturnType<typeof parseActionKey>>) {
  return !VOTE_ACTION_TYPES.has(parsed.actionType) || Boolean(parsed.linkSkillRelationId);
}

function actionPayload(userId: string, parsed: NonNullable<ReturnType<typeof parseActionKey>>) {
  return {
    user_id: userId,
    link_id: parsed.linkId,
    action_type: parsed.actionType,
    link_skill_relation_id: parsed.linkSkillRelationId,
  };
}

function applyRelationContext<TQuery extends {
  eq: (column: string, value: string) => TQuery;
  is: (column: string, value: null) => TQuery;
}>(query: TQuery, linkSkillRelationId: string | null) {
  return linkSkillRelationId
    ? query.eq("link_skill_relation_id", linkSkillRelationId)
    : query.is("link_skill_relation_id", null);
}

function readLocalValue(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

async function writeUserAction(key: string, next: boolean) {
  const parsed = parseActionKey(key);
  const supabase = parsed ? getBrowserSupabase() : null;
  if (!parsed || !supabase || !canWriteAction(parsed)) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (next) {
    const { error } = await supabase
      .from("user_actions")
      .upsert(
        actionPayload(user.id, parsed),
        { onConflict: "user_id,link_id,action_type,action_context_id", ignoreDuplicates: true },
      );
    if (error) console.warn("user_action_upsert_failed", error.message);
    return;
  }

  const query = supabase
    .from("user_actions")
    .delete()
    .eq("user_id", user.id)
    .eq("link_id", parsed.linkId)
    .eq("action_type", parsed.actionType);
  const { error } = await applyRelationContext(query, parsed.linkSkillRelationId);
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

    const parsed = parseActionKey(key);
    const supabase = parsed ? getBrowserSupabase() : null;
    if (parsed && supabase && canWriteAction(parsed)) {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (cancelled) return;
        if (!user) {
          setValue(readLocalValue(key));
          return;
        }
        const query = supabase
          .from("user_actions")
          .select("action_type")
          .eq("user_id", user.id)
          .eq("link_id", parsed.linkId)
          .eq("action_type", parsed.actionType);
        const { data } = await applyRelationContext(query, parsed.linkSkillRelationId).maybeSingle();
        if (!cancelled) setValue(Boolean(data));
      }).catch(() => {
        if (!cancelled) setValue(readLocalValue(key));
      });
    } else {
      setValue(readLocalValue(key));
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
