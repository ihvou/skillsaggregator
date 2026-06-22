"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/browserSupabase";

const ACTION_PREFIXES = ["saved", "completed"] as const;

type ActionType = (typeof ACTION_PREFIXES)[number];

function parseActionKey(key: string): { actionType: ActionType; linkId: string; linkSkillRelationId: string | null } | null {
  const [actionType, linkId, linkSkillRelationId] = key.split(":");
  if (!actionType || !linkId) return null;
  if (!ACTION_PREFIXES.includes(actionType as ActionType)) return null;
  return { actionType: actionType as ActionType, linkId, linkSkillRelationId: linkSkillRelationId ?? null };
}

function actionKey(actionType: ActionType, linkId: string, linkSkillRelationId: string | null) {
  return linkSkillRelationId ? `${actionType}:${linkId}:${linkSkillRelationId}` : `${actionType}:${linkId}`;
}

export function LocalActionSync() {
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const supabaseClient = supabase;

    let cancelled = false;

    async function sync() {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user || cancelled) return;

      const { data: serverRows, error: pullError } = await supabaseClient
        .from("user_actions")
        .select("link_id, action_type, link_skill_relation_id")
        .eq("user_id", user.id);
      if (pullError) {
        console.warn("local_action_pull_failed", pullError.message);
      } else {
        for (const row of serverRows ?? []) {
          if (!ACTION_PREFIXES.includes(row.action_type as ActionType)) continue;
          window.localStorage.setItem(
            actionKey(row.action_type as ActionType, row.link_id, row.link_skill_relation_id ?? null),
            "1",
          );
        }
      }

      const rows = Object.keys(window.localStorage)
        .flatMap((key) => {
          const parsed = parseActionKey(key);
          if (!parsed || window.localStorage.getItem(key) !== "1") return [];
          return [{
            user_id: user.id,
            link_id: parsed.linkId,
            action_type: parsed.actionType,
            link_skill_relation_id: parsed.linkSkillRelationId,
          }];
        });

      if (rows.length === 0) return;
      const { error } = await supabaseClient
        .from("user_actions")
        .upsert(rows, { onConflict: "user_id,link_id,action_type,action_context_id", ignoreDuplicates: true });
      if (error) console.warn("local_action_sync_failed", error.message);
    }

    void sync();
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(() => {
      void sync();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
