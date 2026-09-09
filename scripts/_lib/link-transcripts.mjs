import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const MIN_TRANSCRIPT_LENGTH = 200;

export function normalizeTranscriptText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function transcriptHash(value) {
  return createHash("sha256").update(normalizeTranscriptText(value)).digest("hex");
}

export function youtubeVideoIdFromUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const direct = raw.match(/(?:youtube\.com\/(?:watch\?[^#]*\bv=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  if (direct?.[1]) return direct[1];

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = url.searchParams.get("v");
      if (/^[A-Za-z0-9_-]{11}$/.test(id ?? "")) return id;
      const pathMatch = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch?.[1]) return pathMatch[1];
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (/^[A-Za-z0-9_-]{11}$/.test(id ?? "")) return id;
    }
  } catch (_error) {
    // Non-URL strings are handled by the regex path above.
  }

  return null;
}

export function youtubeVideoIdFromTranscriptFilename(filename) {
  const match = basename(filename).match(/^([A-Za-z0-9_-]{11})(?:\.|$)/);
  return match?.[1] ?? null;
}

export function transcriptLanguageFromFilename(filename) {
  const name = basename(filename);
  const videoId = youtubeVideoIdFromTranscriptFilename(name);
  if (!videoId) return null;
  const match = name.slice(videoId.length).match(/^\.(.+)\.vtt$/i);
  return match?.[1] ?? null;
}

export function transcriptProviderFromFetcher(fetcher) {
  const value = String(fetcher ?? "").toLowerCase();
  if (value === "browser") return "browser";
  // Local audio transcription, not a platform caption track. Kept distinct so a
  // later question about transcript accuracy can separate the two. Allowed set
  // is pinned by the check constraint in migration 0059.
  if (value === "whisper") return "whisper";
  return "ytdlp";
}

/**
 * Which platform a link belongs to. `link_transcripts.source` is stored from
 * this, so a TikTok transcript is no longer labelled "youtube" — which it was,
 * because every writer hardcoded the string back when YouTube was the only
 * source that could produce one.
 */
export function transcriptSourceFromUrl(...urls) {
  const value = urls.filter(Boolean).join(" ").toLowerCase();
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("instagram.com")) return "instagram";
  return "youtube";
}

export function buildLinkTranscriptPayload({
  linkId,
  videoId = null,
  transcriptText,
  provider,
  // Defaults to youtube so existing callers keep their behaviour; the
  // short-form path passes it explicitly.
  source = "youtube",
  language = "en",
  fetchedAt = new Date().toISOString(),
}) {
  const normalized = normalizeTranscriptText(transcriptText);
  if (!linkId) throw new Error("link_transcript_link_id_required");
  if (!provider) throw new Error("link_transcript_provider_required");
  if (!normalized) throw new Error("link_transcript_text_required");

  return {
    link_id: linkId,
    source,
    provider,
    video_id: videoId,
    language,
    transcript_text: normalized,
    transcript_hash: transcriptHash(normalized),
    fetched_at: fetchedAt,
  };
}

export function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.COLLECT_SERVICE_ROLE_KEY
    ?? "";

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function upsertLinkTranscript(supabase, input) {
  const payload = buildLinkTranscriptPayload(input);
  const { data, error } = await supabase
    .from("link_transcripts")
    .upsert(payload, { onConflict: "link_id" })
    .select("link_id, video_id, transcript_hash, provider, fetched_at")
    .single();
  if (error) throw error;
  return data;
}

function hasTranscriptRelation(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function relationArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function toActiveYoutubeLink(row) {
  const videoId = youtubeVideoIdFromUrl(row?.canonical_url) ?? youtubeVideoIdFromUrl(row?.url);
  if (!videoId) return null;
  const relations = relationArray(row.link_skill_relations);
  const humanRelation =
    relations.find((relation) => relation?.submitted_by_user_id)
    ?? null;
  const oldestRelation = relations
    .flatMap((relation) => relation?.created_at ? [relation.created_at] : [])
    .sort()[0] ?? null;
  return {
    id: row.id,
    url: row.url,
    canonical_url: row.canonical_url,
    title: row.title ?? null,
    domain: row.domain ?? null,
    video_id: videoId,
    human_submitted: Boolean(humanRelation),
    human_relation_created_at: humanRelation?.created_at ?? null,
    relation_created_at: oldestRelation,
  };
}

async function collectActiveYoutubeLinksMissingTranscripts(supabase, {
  limit,
  pageSize,
  humanOnly = false,
  excludeIds = new Set(),
}) {
  const max = limit === Infinity ? Infinity : Math.max(0, Number(limit ?? 25));
  const rows = [];
  let from = 0;

  while (max === Infinity || rows.length < max) {
    const to = from + pageSize - 1;
    let query = supabase
      .from("links")
      .select("id, url, canonical_url, title, domain, link_skill_relations!inner(id, created_at, submitted_by_user_id), link_transcripts(link_id)")
      .eq("is_active", true)
      .eq("link_skill_relations.is_active", true);
    if (humanOnly) {
      query = query.not("link_skill_relations.submitted_by_user_id", "is", null);
    }

    const { data, error } = await query.range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (hasTranscriptRelation(row.link_transcripts)) continue;
      const link = toActiveYoutubeLink(row);
      if (!link || excludeIds.has(link.id)) continue;
      rows.push(link);
      excludeIds.add(link.id);
      if (max !== Infinity && rows.length >= max) break;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.sort((a, b) => {
    const humanDiff = Number(b.human_submitted) - Number(a.human_submitted);
    if (humanDiff !== 0) return humanDiff;
    const timeA = Date.parse(a.human_relation_created_at ?? a.relation_created_at ?? "");
    const timeB = Date.parse(b.human_relation_created_at ?? b.relation_created_at ?? "");
    return (Number.isNaN(timeA) ? 0 : timeA) - (Number.isNaN(timeB) ? 0 : timeB);
  });
}

/**
 * Active TikTok/Instagram links with no transcript row, human submissions
 * first — the same ordering the YouTube gap-filler uses, so a link someone
 * shared is transcribed before backlog the collector found on its own.
 *
 * Kept separate from the YouTube selector rather than folded into it: that one
 * requires a parseable YouTube video id and returns null without one, which
 * would silently drop every short-form row.
 */
export async function listActiveShortFormLinksMissingTranscripts(supabase, {
  limit = 25,
  pageSize = 1000,
  platform = null,
} = {}) {
  const max = limit === Infinity ? Infinity : Math.max(0, Number(limit ?? 25));
  if (max === 0) return [];

  const rows = [];
  const seen = new Set();
  let from = 0;

  while (max === Infinity || rows.length < max) {
    const { data, error } = await supabase
      .from("links")
      .select("id, url, canonical_url, title, domain, link_skill_relations!inner(id, created_at, submitted_by_user_id), link_transcripts(link_id)")
      .eq("is_active", true)
      .eq("link_skill_relations.is_active", true)
      .or("url.ilike.%tiktok.com%,url.ilike.%instagram.com%")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (hasTranscriptRelation(row.link_transcripts)) continue;
      if (seen.has(row.id)) continue;
      const source = transcriptSourceFromUrl(row.canonical_url, row.url);
      if (source === "youtube") continue;
      if (platform && source !== platform) continue;

      const relations = relationArray(row.link_skill_relations);
      const humanRelation = relations.find((relation) => relation?.submitted_by_user_id) ?? null;
      const oldest = relations
        .flatMap((relation) => (relation?.created_at ? [relation.created_at] : []))
        .sort()[0] ?? null;

      seen.add(row.id);
      rows.push({
        id: row.id,
        url: row.url,
        canonical_url: row.canonical_url,
        title: row.title ?? null,
        domain: row.domain ?? null,
        platform: source,
        human_submitted: Boolean(humanRelation),
        human_relation_created_at: humanRelation?.created_at ?? null,
        relation_created_at: oldest,
      });
      if (max !== Infinity && rows.length >= max) break;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.sort((a, b) => {
    const humanDiff = Number(b.human_submitted) - Number(a.human_submitted);
    if (humanDiff !== 0) return humanDiff;
    const timeA = Date.parse(a.human_relation_created_at ?? a.relation_created_at ?? "");
    const timeB = Date.parse(b.human_relation_created_at ?? b.relation_created_at ?? "");
    return (Number.isNaN(timeA) ? 0 : timeA) - (Number.isNaN(timeB) ? 0 : timeB);
  });
}

export async function findActiveYoutubeLinkByVideoId(supabase, videoId) {
  const id = String(videoId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

  const { data, error } = await supabase
    .from("links")
    .select("id, url, canonical_url, title, domain, link_skill_relations!inner(id)")
    .eq("is_active", true)
    .eq("link_skill_relations.is_active", true)
    .or(`canonical_url.ilike.%${id}%,url.ilike.%${id}%`)
    .limit(25);
  if (error) throw error;

  for (const row of data ?? []) {
    const link = toActiveYoutubeLink(row);
    if (link?.video_id === id) return link;
  }
  return null;
}

export async function listActiveYoutubeLinksMissingTranscripts(supabase, {
  limit = 25,
  pageSize = 1000,
} = {}) {
  const max = limit === Infinity ? Infinity : Math.max(0, Number(limit ?? 25));
  if (max === 0) return [];

  const seen = new Set();
  const humanRows = await collectActiveYoutubeLinksMissingTranscripts(supabase, {
    limit: max,
    pageSize,
    humanOnly: true,
    excludeIds: seen,
  });
  if (max !== Infinity && humanRows.length >= max) return humanRows.slice(0, max);

  const backlogRows = await collectActiveYoutubeLinksMissingTranscripts(supabase, {
    limit: max === Infinity ? Infinity : max - humanRows.length,
    pageSize,
    humanOnly: false,
    excludeIds: seen,
  });

  return [...humanRows, ...backlogRows].slice(0, max === Infinity ? undefined : max);
}

export async function readTranscriptCacheEntries(dir, { vttToText }) {
  const files = await readdir(dir);
  const byVideoId = new Map();

  for (const file of files) {
    if (!file.endsWith(".vtt")) continue;
    const videoId = youtubeVideoIdFromTranscriptFilename(file);
    if (!videoId) continue;

    const path = join(dir, file);
    const info = await stat(path);
    if (!info.isFile()) continue;

    const vtt = await readFile(path, "utf8");
    const text = normalizeTranscriptText(vttToText(vtt));
    if (!text) continue;

    const entry = {
      video_id: videoId,
      language: transcriptLanguageFromFilename(file),
      file,
      path,
      bytes: info.size,
      transcript_text: text,
      transcript_length: text.length,
    };
    const existing = byVideoId.get(videoId);
    if (!existing || entry.transcript_length > existing.transcript_length) {
      byVideoId.set(videoId, entry);
    }
  }

  return [...byVideoId.values()].sort((a, b) => a.video_id.localeCompare(b.video_id));
}
