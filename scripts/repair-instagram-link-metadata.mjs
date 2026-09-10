/**
 * Repair Instagram links that stored Meta's UI chrome as their thumbnail, and
 * backfill the creator handle that was never read.
 *
 * WHAT WENT WRONG. `_shared/link-enrichment.ts` scraped og:image and stored
 * whatever came back. Instagram sometimes answers with a bundled UI asset from a
 * `rsrc.php` path instead of the post's poster frame, and that value is
 * non-null, so nothing downstream knew to retry: 32 of 51 Instagram links
 * rendered the Instagram logo — 778KB, byte-identical on every one. The same
 * failure shape M135 fixed for titles ("Instagram" as a title), on the other
 * field. The enrichment now rejects those via usableThumbnail(); this repairs
 * the rows written before it did.
 *
 * Separately, creator_handle was null on 21 of 22 published Instagram links.
 * Nothing read it: the collector only gets a bare /reel/<code> URL from search,
 * and the Instagram enrichment branch never set the field. It is available in
 * twitter:title, which we were already fetching.
 *
 * THE POSTS ARE ALIVE. Re-fetched, they serve a real og:image, so this is a
 * transient response variant rather than a dead post — worth repairing rather
 * than writing off. A post that is genuinely gone answers with the shell again,
 * and is left with a null thumbnail, which is the honest state.
 *
 * Usage:
 *   node scripts/repair-instagram-link-metadata.mjs [--limit N] [--dry-run] [--gap-ms N]
 */
import { setTimeout as sleep } from "node:timers/promises";
import { loadCollectionEnv } from "./_lib/script-env.mjs";
import { createServiceRoleSupabaseClient } from "./_lib/link-transcripts.mjs";

await loadCollectionEnv({ preferHosted: process.env.COLLECT_TARGET === "hosted" });

const USER_AGENT = "Subskills/1.0 (+https://subskills.xyz)";
const SHELL_IMAGE = /(?:cdninstagram\.com|fbcdn\.net)\/rsrc\.php\//i;
// Same ceiling as _shared/thumbnail-storage.ts. Worth noting it explains the
// original symptom: the placeholder PNG is 778KB, so the cache rejected it as
// too large and the row kept the remote URL — which is exactly the set of rows
// that rendered a logo.
const MAX_THUMBNAIL_BYTES = 500 * 1024;

/**
 * Mirrors stableSocialThumbnailKey + cacheThumbnail from the edge functions.
 *
 * Repaired rows need this because thumbnail caching only ever runs at apply
 * time, and these links were applied long ago. Without it the repair swaps one
 * expiring URL for another: Instagram's scontent URLs are signed and will 403
 * once the signature lapses, so the cards would go blank again in days.
 */
function storageKeyFor(url) {
  try {
    const parsed = new URL(url);
    const id = parsed.pathname.split("/").filter(Boolean).slice(0, 3).join("-");
    if (id) return `instagram/${id}.jpg`;
  } catch {
    // fall through
  }
  return null;
}

async function cacheThumbnail(supabaseClient, imageUrl, objectKey) {
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
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_THUMBNAIL_BYTES) throw new Error(`thumbnail_too_large:${bytes.byteLength}`);

  const { error: uploadError } = await supabaseClient.storage
    .from("thumbnails")
    .upload(objectKey, bytes, { contentType, upsert: true });
  if (uploadError) throw uploadError;
  return `thumbnails/${objectKey}`;
}

function arg(name, fallback = null) {
  const eq = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(eq));
  if (found) return found.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? true) : fallback;
}

const limit = Number(arg("limit", 100));
const gapMs = Number(arg("gap-ms", 2000));
const dryRun = Boolean(arg("dry-run", false));

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

function handleFromMeta(html) {
  const twitterTitle = metaTagContent(html, ["twitter:title"]);
  const parenthesised = twitterTitle?.match(/\(@([A-Za-z0-9._]{1,30})\)/);
  if (parenthesised?.[1]) return parenthesised[1];
  const description = metaTagContent(html, ["og:description", "twitter:description"]);
  return description?.match(/-\s*([A-Za-z0-9._]{1,30})\s+on\s/)?.[1] ?? null;
}

const supabase = createServiceRoleSupabaseClient();

// Every active Instagram link that is missing a handle or carrying the shell
// image. Rows already holding a cached storage path keep it — the cached copy is
// the real poster and does not expire.
const { data: links, error } = await supabase
  .from("links")
  .select("id, url, canonical_url, thumbnail_url, thumbnail_storage_path, creator_handle")
  .eq("is_active", true)
  .ilike("url", "%instagram.com%")
  .limit(limit);
if (error) throw error;

const targets = (links ?? []).filter((link) =>
  !link.creator_handle
  || (SHELL_IMAGE.test(link.thumbnail_url ?? "") && !link.thumbnail_storage_path)
  // A signed remote URL with no cached copy is a card that will go blank later,
  // so it is a repair target even when nothing about it looks wrong today.
  || (!link.thumbnail_storage_path && (link.thumbnail_url ?? "").includes("scontent"))
);

log("info", "instagram_repair_started", {
  instagram_links: links?.length ?? 0, needing_repair: targets.length, dry_run: dryRun,
});

const stats = { checked: 0, thumbnail_fixed: 0, handle_fixed: 0, cached: 0, cache_failed: 0, still_shell: 0, failed: 0 };

for (const [index, link] of targets.entries()) {
  const url = link.canonical_url ?? link.url;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    stats.checked += 1;
    if (!response.ok) {
      stats.failed += 1;
      log("warn", "instagram_repair_fetch_failed", { link_id: link.id, status: response.status });
      continue;
    }
    const html = await response.text();

    const image = metaTagContent(html, ["og:image", "twitter:image", "twitter:image:src"]);
    const handle = handleFromMeta(html);
    const patch = {};

    if (image && !SHELL_IMAGE.test(image)) {
      if (SHELL_IMAGE.test(link.thumbnail_url ?? "")) patch.thumbnail_url = image;

      // Cache it here rather than hoping something else will: nothing else runs
      // over existing links, and the URL we just stored expires.
      if (!link.thumbnail_storage_path) {
        const objectKey = storageKeyFor(url);
        if (objectKey) {
          try {
            // links carries only these three; thumbnail_cache_status/_error/
            // _attempted_at live on the suggestion payload, not on the row.
            patch.thumbnail_storage_path = await cacheThumbnail(supabase, image, objectKey);
            patch.preview_status = "fetched";
            stats.cached += 1;
          } catch (cacheError) {
            stats.cache_failed += 1;
            log("warn", "instagram_repair_cache_failed", {
              link_id: link.id, message: String(cacheError?.message ?? cacheError).slice(0, 140),
            });
          }
        }
      }
    } else if (SHELL_IMAGE.test(link.thumbnail_url ?? "")) {
      // Still the shell. The post is probably gone; null is honest, a logo is not.
      stats.still_shell += 1;
      patch.thumbnail_url = null;
    }

    if (handle && !link.creator_handle) {
      patch.creator_handle = handle;
      patch.creator_url = `https://www.instagram.com/${handle}/`;
    }

    if (!Object.keys(patch).length) continue;
    if (patch.thumbnail_url) stats.thumbnail_fixed += 1;
    if (patch.creator_handle) stats.handle_fixed += 1;

    if (dryRun) {
      log("info", "instagram_repair_would_update", { link_id: link.id, ...patch });
    } else {
      const { error: updateError } = await supabase.from("links").update(patch).eq("id", link.id);
      if (updateError) throw updateError;
      log("info", "instagram_repair_updated", {
        link_id: link.id,
        handle: patch.creator_handle ?? null,
        thumbnail: patch.thumbnail_url ? "replaced" : (patch.thumbnail_url === null ? "cleared" : "unchanged"),
      });
    }
  } catch (repairError) {
    stats.failed += 1;
    log("warn", "instagram_repair_failed", {
      link_id: link.id, message: String(repairError?.message ?? repairError).slice(0, 200),
    });
  }
  if (index < targets.length - 1 && gapMs > 0) await sleep(gapMs);
}

log("info", "instagram_repair_completed", stats);
