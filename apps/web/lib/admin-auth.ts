import { redirect } from "next/navigation";
import { getModeratorEmails, hasSupabaseConfig } from "./env";
import { getAuthSupabase } from "./supabase";

export interface ModeratorState {
  demo: boolean;
  email: string | null;
}

export async function requireModerator(): Promise<ModeratorState> {
  if (!hasSupabaseConfig()) return { demo: true, email: null };

  const supabase = await getAuthSupabase();
  if (!supabase) redirect("/admin/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/admin/login");

  const allowed = getModeratorEmails();
  if (allowed.length > 0 && !allowed.includes(user.email.toLowerCase())) {
    redirect("/admin/login?error=not-allowlisted");
  }

  return { demo: false, email: user.email };
}
