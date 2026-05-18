import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { Linking } from "react-native";
import * as ExpoLinking from "expo-linking";
import type { Session, User } from "@supabase/supabase-js";
import { getKeys } from "./localState";
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
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTION_PREFIXES = ["saved", "completed", "upvote", "downvote"] as const;
const supabase = getSupabase();
type ActionType = (typeof ACTION_PREFIXES)[number];

function redirectTo() {
  return ExpoLinking.createURL("auth/callback");
}

function parseActionKey(key: string): { actionType: ActionType; linkId: string; linkSkillRelationId: string | null } | null {
  const [actionType, linkId, linkSkillRelationId] = key.split(":");
  if (!actionType || !linkId) return null;
  if (!ACTION_PREFIXES.includes(actionType as ActionType)) return null;
  return { actionType: actionType as ActionType, linkId, linkSkillRelationId: linkSkillRelationId ?? null };
}

function needsRelation(actionType: ActionType) {
  return actionType === "upvote" || actionType === "downvote";
}

function actionRowsForUser(userId: string) {
  return ACTION_PREFIXES.flatMap((prefix) =>
    getKeys(`${prefix}:`).flatMap((key) => {
      const parsed = parseActionKey(key);
      if (!parsed) return [];
      if (needsRelation(parsed.actionType) && !parsed.linkSkillRelationId) return [];
      return [{
        user_id: userId,
        link_id: parsed.linkId,
        action_type: parsed.actionType,
        link_skill_relation_id: parsed.linkSkillRelationId,
      }];
    }),
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    if (!supabase || !nextSession?.user) return;
    const rows = actionRowsForUser(nextSession.user.id);
    if (rows.length === 0) return;
    const { error } = await supabase
      .from("user_actions")
      .upsert(rows, { onConflict: "user_id,link_id,action_type,action_context_id", ignoreDuplicates: true });
    if (error) console.warn("mobile_action_sync_failed", error.message);
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
      await syncLocalActions(nextSession);
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
