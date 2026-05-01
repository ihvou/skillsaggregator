"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function signIn() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setStatus("Supabase env is not configured.");
      return;
    }

    const supabase = createClient(url, anonKey);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setStatus(error ? error.message : "Magic link sent.");
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-ink">Moderator login</h1>
      <p className="mt-2 text-sm leading-6 text-graphite">
        Use an allowlisted email to receive a Supabase magic link.
      </p>
      <label className="mt-5 block text-sm font-medium text-ink" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="focus-ring mt-2 min-h-11 w-full rounded-md border border-ink/15 px-3"
      />
      <button
        type="button"
        onClick={signIn}
        className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-court px-4 text-sm font-semibold text-white hover:bg-ink"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        Send magic link
      </button>
      {status ? <p className="mt-3 text-sm text-graphite">{status}</p> : null}
    </div>
  );
}
