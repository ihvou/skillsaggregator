"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/browserSupabase";

const ACTION_PREFIXES = ["saved", "completed", "upvote", "downvote"] as const;

type ActionType = (typeof ACTION_PREFIXES)[number];

function parseActionKey(key: string): { actionType: ActionType; linkId: string } | null {
  const [actionType, linkId] = key.split(":");
  if (!actionType || !linkId) return null;
  if (!ACTION_PREFIXES.includes(actionType as ActionType)) return null;
  return { actionType: actionType as ActionType, linkId };
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

      const rows = Object.keys(window.localStorage)
        .flatMap((key) => {
          const parsed = parseActionKey(key);
          if (!parsed || window.localStorage.getItem(key) !== "1") return [];
          return [{ user_id: user.id, link_id: parsed.linkId, action_type: parsed.actionType }];
        });

      if (rows.length === 0) return;
      const { error } = await supabaseClient
        .from("user_actions")
        .upsert(rows, { onConflict: "user_id,link_id,action_type", ignoreDuplicates: true });
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
