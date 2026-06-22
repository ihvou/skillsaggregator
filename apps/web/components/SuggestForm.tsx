"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CategorySummary, SkillLevel, SkillSummary } from "@skillsaggregator/shared";
import { getBrowserSupabase } from "@/lib/browserSupabase";

interface CatalogOption {
  category: CategorySummary;
  skills: SkillSummary[];
}

interface SuggestFormProps {
  catalogs: CatalogOption[];
  initialCategorySlug?: string | undefined;
  initialSkillSlug?: string | undefined;
  contributorSlug?: string | null;
}

const LEVELS: Array<{ value: SkillLevel; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export function SuggestForm({
  catalogs,
  initialCategorySlug,
  initialSkillSlug,
  contributorSlug,
}: SuggestFormProps) {
  const initialCatalog =
    catalogs.find((item) => item.category.slug === initialCategorySlug) ?? catalogs[0] ?? null;
  const [categoryId, setCategoryId] = useState(initialCatalog?.category.id ?? "");
  const selectedCatalog = catalogs.find((item) => item.category.id === categoryId) ?? catalogs[0];
  const initialSkill =
    selectedCatalog?.skills.find((skill) => skill.slug === initialSkillSlug) ??
    selectedCatalog?.skills[0] ??
    null;
  const [skillId, setSkillId] = useState(initialSkill?.id ?? "");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useMemo(() => getBrowserSupabase(), []);

  function onCategoryChange(nextCategoryId: string) {
    const nextCatalog = catalogs.find((item) => item.category.id === nextCategoryId);
    setCategoryId(nextCategoryId);
    setSkillId(nextCatalog?.skills[0]?.id ?? "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setError(null);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabase || !supabaseUrl || !anonKey) {
      setError("Supabase is not configured for public suggestions.");
      return;
    }
    if (!skillId) {
      setError("Choose a skill before submitting.");
      return;
    }

    setIsSubmitting(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setIsSubmitting(false);
      setError("Sign in to suggest a resource.");
      return;
    }
    const bearer = session.access_token;
    const response = await fetch(`${supabaseUrl}/functions/v1/submit-suggestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        type: "LINK_ADD",
        origin_type: "human",
        origin_name: contributorSlug ? `web_${contributorSlug}` : "web_authenticated",
        category_id: categoryId,
        skill_id: skillId,
        payload_json: {
          url,
          canonical_url: url,
          target_skill_id: skillId,
          public_note: note.trim() || null,
          skill_level: level || null,
          language: "en",
        },
      }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      setError(body.error ?? "Suggestion failed. Please try again.");
      return;
    }

    setUrl("");
    setNote("");
    setLevel("");
    setStatus(
      body.duplicate
        ? "already submitted, thanks"
        : "Thanks! Your suggestion is queued for coach review.",
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-8 max-w-2xl space-y-5 rounded-lg bg-surface p-4 shadow-card ring-1 ring-divider"
    >
      <label className="block">
        <span className="text-sm font-bold text-ink">URL</span>
        <input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="focus-ring mt-2 w-full rounded-md border border-divider bg-bg px-3 py-2 text-base text-ink"
          placeholder="https://..."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-ink">Category</span>
          <select
            value={categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="focus-ring mt-2 w-full rounded-md border border-divider bg-bg px-3 py-2 text-base text-ink"
          >
            {catalogs.map((catalog) => (
              <option key={catalog.category.id} value={catalog.category.id}>
                {catalog.category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-ink">Skill</span>
          <select
            value={skillId}
            onChange={(event) => setSkillId(event.target.value)}
            className="focus-ring mt-2 w-full rounded-md border border-divider bg-bg px-3 py-2 text-base text-ink"
          >
            {(selectedCatalog?.skills ?? []).map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-ink">Level</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="focus-within:ring-focus inline-flex items-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-bold text-muted">
            <input
              type="radio"
              name="level"
              checked={level === ""}
              onChange={() => setLevel("")}
            />
            Not sure
          </label>
          {LEVELS.map((item) => (
            <label
              key={item.value}
              className="focus-within:ring-focus inline-flex items-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-bold text-muted"
            >
              <input
                type="radio"
                name="level"
                checked={level === item.value}
                onChange={() => setLevel(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-bold text-ink">Public note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 140))}
          className="focus-ring mt-2 min-h-24 w-full rounded-md border border-divider bg-bg px-3 py-2 text-base text-ink"
          placeholder="Why is this useful?"
          maxLength={140}
        />
        <span className="mt-1 block text-right text-xs text-faint">{note.length}/140</span>
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="focus-ring inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-surface transition hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting ? "Submitting..." : "Submit suggestion"}
      </button>

      {status ? <p className="text-sm font-bold text-accent">{status}</p> : null}
      {error ? (
        <p className="text-sm font-bold text-red-600">
          {error === "Sign in to suggest a resource." ? (
            <Link className="underline underline-offset-2" href="/sign-in?next=/suggest">
              {error}
            </Link>
          ) : error}
        </p>
      ) : null}
    </form>
  );
}
