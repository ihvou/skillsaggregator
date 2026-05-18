"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { getBrowserSupabase } from "@/lib/browserSupabase";

interface SignInFormProps {
  nextPath?: string;
}

function callbackUrl(nextPath: string) {
  const origin = window.location.origin;
  const next = nextPath.startsWith("/") ? nextPath : "/contributors/me";
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function SignInForm({ nextPath = "/contributors/me" }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = getBrowserSupabase();

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }
    setIsSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl(nextPath),
        shouldCreateUser: true,
      },
    });
    setIsSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setStatus("Check your email for a magic link.");
  }

  async function signInWithGoogle() {
    setError(null);
    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(nextPath) },
    });
    if (signInError) setError(signInError.message);
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-md rounded-lg bg-surface p-4 shadow-card ring-1 ring-divider">
      <form onSubmit={sendMagicLink} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-ink">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="focus-ring mt-2 w-full rounded-md border border-divider bg-bg px-3 py-2 text-base text-ink"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-surface transition hover:opacity-90 disabled:opacity-60"
        >
          <Mail className="h-4 w-4" />
          {isSubmitting ? "Sending..." : "Send magic link"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase text-faint">
        <span className="h-px flex-1 bg-divider" />
        or
        <span className="h-px flex-1 bg-divider" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="focus-ring w-full rounded-md border border-divider bg-bg px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-bgGroup"
      >
        Continue with Google
      </button>

      {status ? <p className="mt-4 text-sm font-medium text-accent">{status}</p> : null}
      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
