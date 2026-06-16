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
  return String(fetcher ?? "").toLowerCase() === "browser" ? "browser" : "ytdlp";
}

export function buildLinkTranscriptPayload({
  linkId,
  videoId = null,
  transcriptText,
  provider,
  language = "en",
  fetchedAt = new Date().toISOString(),
}) {
  const normalized = normalizeTranscriptText(transcriptText);
  if (!linkId) throw new Error("link_transcript_link_id_required");
  if (!provider) throw new Error("link_transcript_provider_required");
  if (!normalized) throw new Error("link_transcript_text_required");

  return {
    link_id: linkId,
    source: "youtube",
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

function toActiveYoutubeLink(row) {
  const videoId = youtubeVideoIdFromUrl(row?.canonical_url) ?? youtubeVideoIdFromUrl(row?.url);
  if (!videoId) return null;
  return {
    id: row.id,
    url: row.url,
    canonical_url: row.canonical_url,
    title: row.title ?? null,
    domain: row.domain ?? null,
    video_id: videoId,
  };
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
  const rows = [];
  let from = 0;

  while (max === Infinity || rows.length < max) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("links")
      .select("id, url, canonical_url, title, domain, link_skill_relations!inner(id), link_transcripts(id)")
      .eq("is_active", true)
      .eq("link_skill_relations.is_active", true)
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (hasTranscriptRelation(row.link_transcripts)) continue;
      const link = toActiveYoutubeLink(row);
      if (!link) continue;
      rows.push(link);
      if (max !== Infinity && rows.length >= max) break;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
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
