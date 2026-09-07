import { tiktokVideoIdFromUrl } from "./tiktok-url.mjs";

/**
 * Metadata enrichment for a bare human-submitted link.
 *
 * Lives here because BOTH suggestion paths need it, and for a while only one had
 * it (M134): `apply-suggestion` enriched links on their way into the catalogue,
 * while `submit-suggestion`'s "save to Watch later only" path inserted whatever
 * the client sent — for a pasted URL, just the URL. Those links landed in the
 * user's own list with no title and no thumbnail, i.e. a blank card, on the exact
 * path the share-in feature is built around.
 *
 * The function is deliberately pure with respect to the database: payload in,
 * enriched payload (or null) out. Each caller decides what to do with it —
 * `apply-suggestion` writes it back to the suggestion row, `submit-suggestion`
 * inserts it into `links` directly.
 */
export type LinkAddPayload = {
  url?: string;
  canonical_url?: string;
  title?: string | null;
  description?: string | null;
  content_type?: string | null;
  thumbnail_url?: string | null;
  thumbnail_dynamic_url?: string | null;
  thumbnail_storage_path?: string | null;
  thumbnail_cache_status?: "cached" | "failed" | null;
  thumbnail_cache_error?: string | null;
  thumbnail_cache_attempted_at?: string | null;
  duration_seconds?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  favorite_count?: number | null;
  creator_handle?: string | null;
  creator_url?: string | null;
  creator_platform?: "youtube" | "tiktok" | "instagram" | null;
  creator_profile?: Record<string, unknown> | null;
  scoring_strategy?: "transcript_llm" | "engagement_authority";
  review_lane?: "coach" | "founder" | "agent" | "private";
};

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Subskills/1.0 (+https://subskills.xyz)";

export function youtubeVideoIdFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] ?? null;
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] ?? null;
      return parsed.searchParams.get("v");
    }
    if (hostname === "i.ytimg.com" || hostname.endsWith(".ytimg.com") || hostname === "img.youtube.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const videoIndex = parts.findIndex((part) => part === "vi");
      return videoIndex >= 0 ? parts[videoIndex + 1] ?? null : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function sourceFromUrl(value: string | null | undefined): "youtube" | "tiktok" | "instagram" | "other" {
  if (!value) return "other";
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      return "youtube";
    }
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok";
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram";
  } catch {
    return "other";
  }
  return "other";
}

export function isTikTokPayload(payload: LinkAddPayload) {
  return payload.creator_platform === "tiktok"
    || sourceFromUrl(payload.canonical_url) === "tiktok"
    || sourceFromUrl(payload.url) === "tiktok"
    || Boolean(tiktokVideoIdFromUrl(payload.canonical_url))
    || Boolean(tiktokVideoIdFromUrl(payload.url));
}

export function isInstagramPayload(payload: LinkAddPayload) {
  return payload.creator_platform === "instagram"
    || sourceFromUrl(payload.canonical_url) === "instagram"
    || sourceFromUrl(payload.url) === "instagram";
}

function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function metaTagContent(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/\s([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attrs.set(match[1].toLowerCase(), match[2]);
    }
    // Order is not guaranteed: Instagram emits content= before property= on some
    // tags, so read the attribute map rather than assuming a sequence.
    const key = attrs.get("property") ?? attrs.get("name");
    if (key && wanted.has(key.toLowerCase())) {
      return decodeHtmlEntities(attrs.get("content"));
    }
  }
  return null;
}

function titleTagContent(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1]);
}

async function fetchTikTokOEmbed(payload: LinkAddPayload) {
  const url = payload.canonical_url ?? payload.url;
  if (!url) return null;
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.warn("link_enrichment_tiktok_oembed_failed", { status: response.status, url });
    return null;
  }
  return await response.json() as {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
    author_url?: string;
  };
}

async function fetchOpenGraph(payload: LinkAddPayload) {
  const url = payload.canonical_url ?? payload.url;
  if (!url) return null;
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.warn("link_enrichment_og_fetch_failed", { status: response.status, url });
    return null;
  }
  const html = await response.text();
  return {
    title: metaTagContent(html, ["og:title", "twitter:title"]) ?? titleTagContent(html),
    description: metaTagContent(html, ["og:description", "twitter:description", "description"]),
    thumbnail_url: metaTagContent(html, ["og:image", "twitter:image", "twitter:image:src"]),
  };
}

/**
 * Returns an enriched copy of the payload, or `null` when nothing was added —
 * either it already had what it needs, the platform is unsupported, or the
 * remote lookup failed.
 *
 * Never throws. Enrichment is a best-effort call to a third party; a slow or
 * broken oEmbed must never block or fail the save that depends on it.
 */
export async function enrichLinkPayload(payload: LinkAddPayload): Promise<LinkAddPayload | null> {
  try {
    // Anything the collector produced already has these; only bare human links need it.
    if (payload.title && (payload.thumbnail_url || payload.thumbnail_storage_path)) return null;

    const videoId = youtubeVideoIdFromUrl(payload.canonical_url) ?? youtubeVideoIdFromUrl(payload.url);

    if (!videoId && isTikTokPayload(payload)) {
      const body = await fetchTikTokOEmbed(payload);
      if (!body) return null;
      return {
        ...payload,
        title: payload.title ?? body.title ?? null,
        thumbnail_url: payload.thumbnail_url ?? body.thumbnail_url ?? null,
        content_type: payload.content_type ?? "video",
        creator_handle: payload.creator_handle ?? body.author_name ?? null,
        creator_url: payload.creator_url ?? body.author_url ?? null,
        creator_platform: payload.creator_platform ?? "tiktok",
        scoring_strategy: payload.scoring_strategy ?? "engagement_authority",
      };
    }

    if (!videoId && isInstagramPayload(payload)) {
      const og = await fetchOpenGraph(payload);
      if (!og) return null;
      return {
        ...payload,
        title: payload.title ?? og.title,
        description: payload.description ?? og.description,
        thumbnail_url: payload.thumbnail_url ?? og.thumbnail_url,
        content_type: payload.content_type ?? "video",
        creator_platform: payload.creator_platform ?? "instagram",
        scoring_strategy: payload.scoring_strategy ?? "engagement_authority",
      };
    }

    if (!videoId) return null;

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      // 404 here is meaningful: private, deleted or bogus video id.
      console.warn("link_enrichment_oembed_failed", { video_id: videoId, status: response.status });
      return null;
    }
    const body = await response.json() as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };
    return {
      ...payload,
      title: body.title ?? null,
      // Fall back to the deterministic thumbnail path; oEmbed always has one, but the
      // link is useless without an image and this URL is derivable from the id alone.
      thumbnail_url: body.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      content_type: "video",
      creator_handle: payload.creator_handle ?? body.author_name ?? null,
      creator_platform: payload.creator_platform ?? "youtube",
      scoring_strategy: payload.scoring_strategy ?? "transcript_llm",
    };
  } catch (error) {
    console.warn("link_enrichment_failed", {
      error: error instanceof Error ? error.message : String(error),
      url: payload.canonical_url ?? payload.url ?? null,
    });
    return null;
  }
}
