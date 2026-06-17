import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { Linking } from "react-native";
import * as ExpoLinking from "expo-linking";
import type { Session, User } from "@supabase/supabase-js";
import {
  earliestIsoTimestamp,
  getCompletedAt,
  getKeys,
  setCompletedAt,
  setFlag,
} from "./localState";
import { getSupabase } from "./supabase";

export interface ContributorProfile {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  accepted_count: number;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: ContributorProfile | null;
  isLoading: boolean;
  signInWithMagicLink: (email: string) => Promise<string>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  actionSyncRevision: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTION_PREFIXES = ["saved", "completed", "upvote", "downvote"] as const;
const supabase = getSupabase();
type ActionType = (typeof ACTION_PREFIXES)[number];

interface UserActionRow {
  user_id: string;
  link_id: string;
  action_type: ActionType;
  link_skill_relation_id: string | null;
  created_at?: string;
}

interface ServerActionRow {
  link_id: string | null;
  action_type: string | null;
  link_skill_relation_id: string | null;
  created_at: string | null;
}

function redirectTo() {
  return ExpoLinking.createURL("auth/callback");
}

function parseActionKey(key: string): { actionType: ActionType; linkId: string; linkSkillRelationId: string | null } | null {
  const [actionType, linkId, linkSkillRelationId] = key.split(":");
  if (!actionType || !linkId) return null;
  if (!ACTION_PREFIXES.includes(actionType as ActionType)) return null;
  return { actionType: actionType as ActionType, linkId, linkSkillRelationId: linkSkillRelationId ?? null };
}

function isActionType(value: string | null | undefined): value is ActionType {
  return ACTION_PREFIXES.includes(value as ActionType);
}

function needsRelation(actionType: ActionType) {
  return actionType === "upvote" || actionType === "downvote";
}

function actionKey(actionType: ActionType, linkId: string, linkSkillRelationId: string | null) {
  return linkSkillRelationId ? `${actionType}:${linkId}:${linkSkillRelationId}` : `${actionType}:${linkId}`;
}

function actionRowForUser(
  userId: string,
  parsed: { actionType: ActionType; linkId: string; linkSkillRelationId: string | null },
): UserActionRow {
  return {
    user_id: userId,
    link_id: parsed.linkId,
    action_type: parsed.actionType,
    link_skill_relation_id: parsed.linkSkillRelationId,
  };
}

function actionRowsForUser(userId: string, nowIso = new Date().toISOString()) {
  return ACTION_PREFIXES.flatMap((prefix) =>
    getKeys(`${prefix}:`).flatMap((key) => {
      const parsed = parseActionKey(key);
      if (!parsed) return [];
      if (needsRelation(parsed.actionType) && !parsed.linkSkillRelationId) return [];
      const row = actionRowForUser(userId, parsed);
      if (parsed.actionType === "completed") {
        row.created_at = getCompletedAt(parsed.linkId) ?? setCompletedAt(parsed.linkId, nowIso);
      }
      return [row];
    }),
  );
}

function mergeActionRow(rows: Map<string, UserActionRow>, row: UserActionRow) {
  const key = actionKey(row.action_type, row.link_id, row.link_skill_relation_id);
  const existing = rows.get(key);
  if (!existing) {
    rows.set(key, row);
    return;
  }
  if (row.action_type === "completed") {
    const createdAt = earliestIsoTimestamp(existing.created_at, row.created_at);
    rows.set(key, {
      ...existing,
      ...row,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionSyncRevision, setActionSyncRevision] = useState(0);

  async function refreshProfileForSession(nextSession: Session | null) {
    if (!supabase || !nextSession?.user) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("contributor_profiles")
      .select("id, slug, display_name, avatar_url, accepted_count")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();
    if (error) {
      console.warn("mobile_profile_load_failed", error.message);
      setProfile(null);
      return;
    }
    setProfile(data ?? null);
  }

  async function syncLocalActions(nextSession: Session | null) {
    if (!supabase || !nextSession?.user) return false;
    const userId = nextSession.user.id;
    const nowIso = new Date().toISOString();
    const localRows = actionRowsForUser(userId, nowIso);
    const mergedRows = new Map<string, UserActionRow>();
    const serverCompletedAtByKey = new Map<string, string>();

    console.info("[mobile-actions] Starting local/server action sync", {
      localCount: localRows.length,
      userId,
    });

    const { data: serverRows, error: pullError } = await supabase
      .from("user_actions")
      .select("link_id, action_type, link_skill_relation_id, created_at")
      .eq("user_id", userId);

    if (pullError) {
      console.warn("[mobile-actions] Pull failed; pushing local actions only", pullError.message);
    } else {
      for (const row of (serverRows ?? []) as ServerActionRow[]) {
        if (!row.link_id || !isActionType(row.action_type)) continue;
        if (needsRelation(row.action_type) && !row.link_skill_relation_id) continue;

        const key = actionKey(row.action_type, row.link_id, row.link_skill_relation_id);
        setFlag(key, true);

        const merged = actionRowForUser(userId, {
          actionType: row.action_type,
          linkId: row.link_id,
          linkSkillRelationId: row.link_skill_relation_id,
        });
        if (row.action_type === "completed") {
          merged.created_at = setCompletedAt(row.link_id, row.created_at ?? nowIso);
          if (row.created_at) serverCompletedAtByKey.set(key, row.created_at);
        }
        mergeActionRow(mergedRows, merged);
      }
    }

    for (const row of localRows) mergeActionRow(mergedRows, row);

    const rows = [...mergedRows.values()];
    const completedRows = rows.filter((row) => row.action_type === "completed");
    const otherRows = rows.filter((row) => row.action_type !== "completed");
    let timestampUpdates = 0;

    if (otherRows.length > 0) {
      const { error } = await supabase
        .from("user_actions")
        .upsert(otherRows, { onConflict: "user_id,link_id,action_type,action_context_id", ignoreDuplicates: true });
      if (error) console.warn("[mobile-actions] Non-completed action push failed", error.message);
    }

    if (completedRows.length > 0) {
      const { error } = await supabase
        .from("user_actions")
        .upsert(completedRows, { onConflict: "user_id,link_id,action_type,action_context_id", ignoreDuplicates: true });
      if (error) {
        console.warn("[mobile-actions] Completed action insert failed", error.message);
      }

      const timestampRepairs = completedRows.filter((row) => {
        const serverCreatedAt = serverCompletedAtByKey.get(actionKey(row.action_type, row.link_id, row.link_skill_relation_id));
        return Boolean(
          row.created_at &&
            serverCreatedAt &&
            Date.parse(row.created_at) < Date.parse(serverCreatedAt),
        );
      });

      await Promise.all(timestampRepairs.map(async (row) => {
        if (!row.created_at) return;
        const { error: updateError } = await supabase
          .from("user_actions")
          .update({ created_at: row.created_at })
          .eq("user_id", userId)
          .eq("link_id", row.link_id)
          .eq("action_type", "completed")
          .is("link_skill_relation_id", null);
        if (updateError) {
          console.warn("[mobile-actions] Completed timestamp repair failed", {
            linkId: row.link_id,
            error: updateError.message,
          });
          return;
        }
        timestampUpdates += 1;
      }));
    }

    console.info("[mobile-actions] Finished local/server action sync", {
      serverCount: serverRows?.length ?? 0,
      localCount: localRows.length,
      mergedCount: rows.length,
      completedCount: completedRows.length,
      timestampUpdates,
    });
    return true;
  }

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    const supabaseClient = supabase;

    let cancelled = false;

    async function applySession(nextSession: Session | null) {
      if (cancelled) return;
      setSession(nextSession);
      await refreshProfileForSession(nextSession);
      const didSync = await syncLocalActions(nextSession);
      if (didSync && !cancelled) setActionSyncRevision((value) => value + 1);
      if (!cancelled) setIsLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    async function handleUrl(url: string | null) {
      if (!url || !url.includes("code=")) return;
      const code = decodeURIComponent(url.match(/[?&]code=([^&]+)/)?.[1] ?? "");
      if (!code) return;
      const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
      if (error) console.warn("mobile_auth_callback_failed", error.message);
    }

    ExpoLinking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", (event) => {
      void handleUrl(event.url);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      subscription.remove();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    isLoading,
    async signInWithMagicLink(email: string) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
      });
      if (error) throw error;
      return "Check your email for a magic link.";
    },
    async signInWithGoogle() {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo(), skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data.url) await Linking.openURL(data.url);
    },
    async signOut() {
      if (!supabase) return;
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    },
    refreshProfile() {
      return refreshProfileForSession(session);
    },
    actionSyncRevision,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
