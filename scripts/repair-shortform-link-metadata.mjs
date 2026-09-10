/**
 * Repair metadata on short-form links, for both platforms, in one lane.
 *
 * WHAT IT FIXES, AND WHY EACH ONE MATTERS
 *
 *   Shell thumbnails. Instagram's og:image sometimes answers with a bundled UI
 *   asset from a `rsrc.php` path rather than the poster frame. 32 of 51
 *   Instagram links held the identical 778KB Instagram logo. Non-null, so it
 *   passed every "has a thumbnail" check — the failure shape M135 fixed for
 *   titles, on the other field (M150).
 *
 *   Uncached thumbnails. Both platforms serve SIGNED CDN URLs that expire, and
 *   caching only ever ran at apply time. A link applied last month has a URL
 *   that will 403 and a card that goes blank, with nothing watching. This is the
 *   reason the repair uploads into storage rather than only rewriting the URL:
 *   without that step it swaps one expiring URL for another.
 *
 *   Missing creator handle. Attribution for the person whose clip it is, and the
 *   thing a viewer clicks through on (M151).
 *
 *   Missing duration. Only the retired engagement_authority path left these
 *   null; the current pipeline measures it from the decoded audio.
 *
 * ONE LANE, NOT TWO SCRIPTS. Everything except metadata acquisition is shared —
 * target selection, the shell guard, caching, the patch, the logging. Only
 * `PLATFORMS[x].fetchMetadata` differs, which is the same shape the collection
 * pipeline itself settled on: one path, and the platform decides only how the
 * facts are obtained. Writing this twice is how the two copies drift.
 *
 * Transcripts are NOT handled here — scripts/fetch-shortform-transcripts.mjs
 * owns those, and since M144 it records failures so it stops re-chewing clips
 * that have no speech.
 *
 * Usage:
 *   node scripts/repair-shortform-link-metadata.mjs [--platform tiktok|instagram]
 *                                                   [--limit N] [--dry-run] [--gap-ms N]
 */
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { loadCollectionEnv } from "./_lib/script-env.mjs";
import { createServiceRoleSupabaseClient } from "./_lib/link-transcripts.mjs";

await loadCollectionEnv({ preferHosted: process.env.COLLECT_TARGET === "hosted" });

const execFileP = promisify(execFile);
const USER_AGENT = "Subskills/1.0 (+https://subskills.xyz)";
const YTDLP_BIN = process.env.YTDLP_BIN ?? "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "ffmpeg";
// Wide enough for any card, small enough to always fit the cache ceiling.
const THUMBNAIL_TARGET_WIDTH = 720;

// Meta serves UI chrome from `rsrc.php` paths; post content lives on
// scontent*.cdninstagram.com. An image from the former is never the poster.
const SHELL_IMAGE = /(?:cdninstagram\.com|fbcdn\.net)\/rsrc\.php\//i;
// Same ceiling as _shared/thumbnail-storage.ts. It also explains the original
// symptom: the placeholder is 778KB, so the cache rejected it as too large,
// which is exactly why those rows kept a remote URL and no cached copy.
const MAX_THUMBNAIL_BYTES = 500 * 1024;

function arg(name, fallback = null) {
  const eq = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(eq));
  if (found) return found.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? true) : fallback;
}

const limit = Number(arg("limit", 200));
const gapMs = Number(arg("gap-ms", 1500));
const dryRun = Boolean(arg("dry-run", false));
const platformFilter = arg("platform", null);

function log(level, event, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta }));
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Mirrors metaTagContent in _shared/link-enrichment.ts: caller preference order. */
function metaTagContent(html, keys) {
  const found = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map();
    for (const match of tag.matchAll(/\s([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attrs.set(match[1].toLowerCase(), match[2]);
    }
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !found.has(key)) found.set(key, content);
  }
  for (const key of keys) {
    const hit = found.get(key.toLowerCase());
    if (hit !== undefined) return decodeEntities(hit);
  }
  return null;
}

/** Duration without downloading the clip: metadata only, ~2s. */
async function probeDuration(url) {
  try {
    const { stdout } = await execFileP(
      YTDLP_BIN,
      ["--skip-download", "--no-warnings", "--print", "%(duration)s", url],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    const seconds = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

const PLATFORMS = {
  instagram: {
    match: (url) => /instagram\.com/i.test(url),
    // yt-dlp cannot read Instagram without credentials — it fails with "login
    // required", which is why instaloader exists in the transcriber. So there is
    // no cheap metadata-only duration here; an Instagram clip gets its duration
    // from the decoded audio when it is transcribed, or not at all. Probing
    // anyway just spends 2s per link to be told no.
    supportsDurationProbe: false,
    // Key convention from stableSocialThumbnailKey in apply-suggestion.
    storageKey(url) {
      try {
        const id = new URL(url).pathname.split("/").filter(Boolean).slice(0, 3).join("-");
        return id ? `instagram/${id}.jpg` : null;
      } catch {
        return null;
      }
    },
    async fetchMetadata(url) {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`og_fetch_failed_${response.status}`);
      const html = await response.text();
      // The handle sits in twitter:title — "Name (@handle) • Instagram reel" —
      // with og:description as a fallback. Neither was read before M151.
      const handle = metaTagContent(html, ["twitter:title"])?.match(/\(@([A-Za-z0-9._]{1,30})\)/)?.[1]
        ?? metaTagContent(html, ["og:description", "twitter:description"])
          ?.match(/-\s*([A-Za-z0-9._]{1,30})\s+on\s/)?.[1]
        ?? null;
      return {
        thumbnailUrl: metaTagContent(html, ["og:image", "twitter:image", "twitter:image:src"]),
        creatorHandle: handle,
        creatorUrl: handle ? `https://www.instagram.com/${handle}/` : null,
      };
    },
  },

  tiktok: {
    match: (url) => /tiktok\.com/i.test(url),
    supportsDurationProbe: true,
    storageKey(url) {
      const videoId = url.match(/\/video\/(\d+)/)?.[1];
      return videoId ? `tiktok/${videoId}.jpg` : null;
    },
    async fetchMetadata(url) {
      const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
      const response = await fetch(endpoint, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`oembed_failed_${response.status}`);
      const body = await response.json();
      // author_name is the DISPLAY name ("Surf Camp Portugal 🇵🇹"), not the
      // handle — _shared/link-enrichment.ts puts it straight into creator_handle,
      // which is why one row reads "hawaii surf camp". Take the handle from the
      // canonical URL, which always carries it, and fall back to author_url.
      const handle = url.match(/\/@([A-Za-z0-9._-]+)\//)?.[1]
        ?? String(body?.author_url ?? "").match(/\/@([A-Za-z0-9._-]+)/)?.[1]
        ?? null;
      return {
        thumbnailUrl: body?.thumbnail_url ?? null,
        creatorHandle: handle,
        creatorUrl: handle ? `https://www.tiktok.com/@${handle}` : (body?.author_url ?? null),
      };
    },
  },
};

function platformFor(url) {
  for (const [name, platform] of Object.entries(PLATFORMS)) {
    if (platform.match(url)) return name;
  }
  return null;
}

/**
 * Shrink an oversized poster instead of giving up on it.
 *
 * TikTok's oEmbed hands back the ORIGINAL: measured at 2160x3840 and 1.47MB,
 * against a 500KB cache ceiling. Without this, every large poster fails to cache
 * and the row keeps a signed URL that expires — a card that goes blank later.
 * Asking the CDN for a smaller rendition does not work: the signature covers the
 * path, so rewriting the `~tplv-...` segment returns 403 and query params are
 * ignored. Downscaling locally is the only route, and ffmpeg is already a
 * dependency of the transcriber. 720px wide lands around 160KB.
 */
function downscaleImage(bytes, contentType) {
  const dir = mkdtempSync(join(tmpdir(), "sf-thumb-"));
  try {
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const input = join(dir, `in.${extension}`);
    const output = join(dir, "out.jpg");
    writeFileSync(input, bytes);
    execFileSync(FFMPEG_BIN, [
      "-v", "error", "-y", "-i", input,
      "-vf", `scale='min(${THUMBNAIL_TARGET_WIDTH},iw)':-2`,
      "-q:v", "4", output,
    ], { timeout: 30_000 });
    return { bytes: new Uint8Array(readFileSync(output)), contentType: "image/jpeg" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cacheThumbnail(supabase, imageUrl, objectKey) {
  const response = await fetch(imageUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": "skillsaggregator-thumbnail-cache/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`thumbnail_fetch_failed_${response.status}`);
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`thumbnail_content_type_rejected:${contentType}`);
  }
  let bytes = new Uint8Array(await response.arrayBuffer());
  let uploadType = contentType;
  if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
    const shrunk = downscaleImage(bytes, contentType);
    if (shrunk.bytes.byteLength > MAX_THUMBNAIL_BYTES) {
      throw new Error(`thumbnail_too_large_after_downscale:${shrunk.bytes.byteLength}`);
    }
    bytes = shrunk.bytes;
    uploadType = shrunk.contentType;
  }

  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(objectKey, bytes, { contentType: uploadType, upsert: true });
  if (error) throw error;
  return `thumbnails/${objectKey}`;
}

const supabase = createServiceRoleSupabaseClient();

const { data: links, error } = await supabase
  .from("links")
  .select("id, url, canonical_url, thumbnail_url, thumbnail_storage_path, creator_handle, creator_url, duration_seconds")
  .eq("is_active", true)
  .or("url.ilike.%tiktok.com%,url.ilike.%instagram.com%")
  .limit(2000);
if (error) throw error;

const needsRepair = (link) =>
  !link.creator_handle
  || link.duration_seconds === null
  // A signed remote URL with no cached copy is a card that will go blank later,
  // so it needs repair even though nothing looks wrong today.
  || !link.thumbnail_storage_path
  || SHELL_IMAGE.test(link.thumbnail_url ?? "");

const targets = (links ?? [])
  .filter((link) => {
    const name = platformFor(link.canonical_url ?? link.url ?? "");
    if (!name) return false;
    if (platformFilter && name !== platformFilter) return false;
    return needsRepair(link);
  })
  .slice(0, limit);

log("info", "shortform_repair_started", {
  short_form_links: links?.length ?? 0,
  needing_repair: targets.length,
  platform: platformFilter ?? "all",
  dry_run: dryRun,
});

const stats = {
  checked: 0, thumbnail_replaced: 0, thumbnail_cleared: 0, cached: 0,
  handle_fixed: 0, duration_fixed: 0, cache_failed: 0, failed: 0,
};

for (const [index, link] of targets.entries()) {
  const url = link.canonical_url ?? link.url;
  const name = platformFor(url);
  const platform = PLATFORMS[name];
  try {
    const meta = await platform.fetchMetadata(url);
    stats.checked += 1;
    const patch = {};

    const isShell = SHELL_IMAGE.test(meta.thumbnailUrl ?? "");
    const usableImage = meta.thumbnailUrl && !isShell ? meta.thumbnailUrl : null;

    // A link that already has a cached copy is DONE — the cached object is the
    // real poster and does not expire. Writing a fresh signed URL onto it would
    // replace a durable null with something that rots.
    if (usableImage && !link.thumbnail_storage_path) {
      if (SHELL_IMAGE.test(link.thumbnail_url ?? "") || !link.thumbnail_url) {
        patch.thumbnail_url = usableImage;
        stats.thumbnail_replaced += 1;
      }
      // Cache here rather than hoping something else will: nothing runs over
      // existing links, and the URL just stored expires.
      {
        const objectKey = platform.storageKey(url);
        if (objectKey) {
          try {
            patch.thumbnail_storage_path = await cacheThumbnail(supabase, usableImage, objectKey);
            patch.preview_status = "fetched";
            stats.cached += 1;
          } catch (cacheError) {
            stats.cache_failed += 1;
            log("warn", "shortform_repair_cache_failed", {
              link_id: link.id, platform: name,
              message: String(cacheError?.message ?? cacheError).slice(0, 140),
            });
          }
        }
      }
    } else if (SHELL_IMAGE.test(link.thumbnail_url ?? "")) {
      // Still the shell on a re-fetch: the post is probably gone. Null is
      // honest; a logo pretending to be a thumbnail is not.
      patch.thumbnail_url = null;
      stats.thumbnail_cleared += 1;
    }

    if (meta.creatorHandle && !link.creator_handle) {
      patch.creator_handle = meta.creatorHandle;
      patch.creator_url = link.creator_url ?? meta.creatorUrl;
      stats.handle_fixed += 1;
    }

    if (link.duration_seconds === null && platform.supportsDurationProbe) {
      const seconds = await probeDuration(url);
      if (seconds !== null) {
        patch.duration_seconds = seconds;
        stats.duration_fixed += 1;
      }
    }

    if (!Object.keys(patch).length) continue;

    if (dryRun) {
      log("info", "shortform_repair_would_update", { link_id: link.id, platform: name, ...patch });
    } else {
      const { error: updateError } = await supabase.from("links").update(patch).eq("id", link.id);
      if (updateError) throw updateError;
      log("info", "shortform_repair_updated", {
        link_id: link.id, platform: name,
        handle: patch.creator_handle ?? null,
        duration: patch.duration_seconds ?? null,
        thumbnail: patch.thumbnail_storage_path ? "cached" : (patch.thumbnail_url ? "replaced" : "unchanged"),
      });
    }
  } catch (repairError) {
    stats.failed += 1;
    log("warn", "shortform_repair_failed", {
      link_id: link.id, platform: name,
      message: String(repairError?.message ?? repairError).slice(0, 200),
    });
  }
  if (index < targets.length - 1 && gapMs > 0) await sleep(gapMs);
}

log("info", "shortform_repair_completed", stats);
