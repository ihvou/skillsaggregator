/**
 * Rehost video thumbnails for the web on Cloudflare R2, served at img.subskills.xyz.
 *
 * WHY. The web showed each thumbnail from where the platform keeps it, and those
 * addresses name the video: i.ytimg.com/vi/<video id>/…, and our own storage keys
 * thumbnails/tiktok/<video id>.jpg and thumbnails/instagram/reel-<code>.jpg. That
 * undid the /go links, which keep video addresses off the page, and sent every
 * visitor's browser to YouTube's image servers.
 *
 * WHAT. For each active video link with no links.web_thumbnail_key:
 *   1. Take the platform's own thumbnail. YouTube: the 1280x720 frame when the
 *      video has one (hq720, maxresdefault), else the 4:3 sizes with their black
 *      bars left in (sddefault, hqdefault). TikTok/Instagram: the copy the
 *      pipeline already keeps in Supabase storage.
 *   2. Resize it to fit 640x640 and encode WebP. Nothing else about the image
 *      changes: no crop, no overlay.
 *   3. Upload it to R2 as v1/<hash of the image>.webp, a name that says nothing
 *      about the video, cached for a year (the name changes if the image does).
 *   4. Record the key on the link. The web builds the URL from it.
 *
 * Links on a published relation go first, then the rest, so a video usually has
 * its thumbnail before the coaches publish it. Idempotent: a link with a key is
 * never touched again, and a failure is simply retried on the next run.
 *
 * WEB ONLY. The app keeps using thumbnail_url and thumbnail_storage_path.
 *
 * Usage:
 *   node scripts/rehost-thumbnails.mjs [--limit N (0 = all)] [--concurrency N]
 *                                      [--published-only] [--dry-run] [--out-dir DIR]
 *
 * Without the R2 settings in .env.hosted (see scripts/_lib/r2.mjs) it logs a
 * warning and exits 0, so the nightly run is unaffected until R2 is set up.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { loadCollectionEnv } from "./_lib/script-env.mjs";
import { createServiceRoleSupabaseClient, youtubeVideoIdFromUrl } from "./_lib/link-transcripts.mjs";
import { putObject, r2ConfigFromEnv } from "./_lib/r2.mjs";

await loadCollectionEnv({ preferHosted: process.env.COLLECT_TARGET === "hosted" });

const USER_AGENT = "Subskills/1.0 (+https://subskills.xyz)";
const MAX_EDGE = 640;
const WEBP_QUALITY = 75;
const KEY_PREFIX = "v1/";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
// Best first. hq720 and maxresdefault are 16:9 with no bars but don't exist for
// every video; hqdefault always does.
const YOUTUBE_VARIANTS = ["hq720", "maxresdefault", "sddefault", "hqdefault"];
// YouTube answers a missing size with a 120x90 placeholder; anything this small is
// not a real thumbnail.
const MIN_SOURCE_EDGE = 200;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 200;
const LINK_COLUMNS = "id, url, canonical_url, domain, thumbnail_url, thumbnail_storage_path";

function parseArgs(argv) {
  const args = { limit: 2000, concurrency: 6, publishedOnly: false, dryRun: false, outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (arg === "--published-only") args.publishedOnly = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error("--limit must be a whole number (0 = all)");
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) throw new Error("--concurrency must be at least 1");
  return args;
}

function log(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

function platformOf(link) {
  const haystack = `${link.domain ?? ""} ${link.canonical_url ?? ""} ${link.url ?? ""}`.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(haystack)) return "youtube";
  if (/tiktok\.com/.test(haystack)) return "tiktok";
  if (/instagram\.com/.test(haystack)) return "instagram";
  return null;
}

function youtubeId(link) {
  return (
    youtubeVideoIdFromUrl(link.canonical_url) ??
    youtubeVideoIdFromUrl(link.url) ??
    /\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//.exec(link.thumbnail_url ?? "")?.[1] ??
    null
  );
}

// The TikTok/Instagram copy in Supabase storage, or failing that the platform URL
// (signed, so possibly expired by now).
function storedThumbnailUrl(link) {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  for (const value of [link.thumbnail_storage_path, link.thumbnail_url]) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (supabaseUrl && /^(thumbnails|link-thumbnails)\//.test(trimmed)) {
      return `${supabaseUrl}/storage/v1/object/public/${trimmed.replace(/^\/+/, "")}`;
    }
  }
  return null;
}

async function fetchImage(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "image/*" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return { failure: `fetch_error:${error?.name ?? "error"}` };
  }
  if (!response.ok) return { failure: `http_${response.status}` };
  const type = response.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("image/")) return { failure: "not_an_image" };
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SOURCE_BYTES) return { failure: "source_too_large" };
  return { buffer };
}

async function loadSource(link) {
  const platform = platformOf(link);
  if (platform === "youtube") {
    const id = youtubeId(link);
    if (!id) return { failure: "no_youtube_id" };
    let lastFailure = "no_variant";
    for (const variant of YOUTUBE_VARIANTS) {
      const result = await fetchImage(`https://i.ytimg.com/vi/${id}/${variant}.jpg`);
      if (result.buffer) return { platform, variant, buffer: result.buffer };
      lastFailure = result.failure;
    }
    return { failure: lastFailure };
  }
  if (platform === "tiktok" || platform === "instagram") {
    const url = storedThumbnailUrl(link);
    if (!url) return { failure: "no_stored_thumbnail" };
    const result = await fetchImage(url);
    return result.buffer ? { platform, variant: "stored", buffer: result.buffer } : { failure: result.failure };
  }
  return { skip: "not_a_video" };
}

async function toWebp(buffer) {
  const image = sharp(buffer, { failOn: "error" });
  const { width, height } = await image.metadata();
  if (!width || !height || Math.max(width, height) < MIN_SOURCE_EDGE) throw new Error("source_too_small");
  const { data, info } = await image
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Keyset pagination by id: rows drop out of "key is null" as they succeed, so an
// offset would skip some. A failed row stays behind the cursor until the next run.
async function* candidates(supabase, { publishedOnly }) {
  const passes = publishedOnly ? ["published"] : ["published", "rest"];
  for (const pass of passes) {
    let after = "00000000-0000-0000-0000-000000000000";
    for (;;) {
      let query = supabase
        .from("links")
        .select(pass === "published" ? `${LINK_COLUMNS}, link_skill_relations!inner(id)` : LINK_COLUMNS)
        .eq("is_active", true)
        .is("web_thumbnail_key", null)
        .gt("id", after)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (pass === "published") {
        query = query.eq("link_skill_relations.published", true).eq("link_skill_relations.is_active", true);
      }
      const { data, error } = await query;
      if (error) throw new Error(`candidate_query_failed(${pass}): ${error.message}`);
      if (!data?.length) break;
      for (const row of data) yield { pass, link: row };
      after = data[data.length - 1].id;
      if (data.length < PAGE_SIZE) break;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const r2 = r2ConfigFromEnv();
  if (!r2 && !args.dryRun) {
    log("rehost_skipped", { reason: "r2_not_configured", hint: "set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in .env.hosted" });
    return;
  }
  if (args.outDir) mkdirSync(args.outDir, { recursive: true });

  const supabase = createServiceRoleSupabaseClient();
  const stats = { considered: 0, rehosted: 0, skipped: 0, failed: 0, bytesIn: 0, bytesOut: 0 };
  const bySource = {};
  const failures = {};
  const seen = new Set();
  let consecutiveWriteFailures = 0;
  const startedAt = Date.now();
  log("rehost_started", { limit: args.limit, concurrency: args.concurrency, publishedOnly: args.publishedOnly, dryRun: args.dryRun });

  async function processLink(link) {
    const source = await loadSource(link);
    if (source.skip) {
      stats.skipped += 1;
      return;
    }
    if (source.failure) {
      stats.failed += 1;
      failures[source.failure] = (failures[source.failure] ?? 0) + 1;
      log("rehost_failed", { link_id: link.id, reason: source.failure });
      return;
    }
    let webp;
    try {
      webp = await toWebp(source.buffer);
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 80);
      stats.failed += 1;
      failures[reason] = (failures[reason] ?? 0) + 1;
      log("rehost_failed", { link_id: link.id, reason });
      return;
    }
    const key = `${KEY_PREFIX}${createHash("sha256").update(webp.data).digest("hex").slice(0, 32)}.webp`;
    if (args.outDir) writeFileSync(join(args.outDir, key.replace(/\//g, "_")), webp.data);
    if (!args.dryRun) {
      try {
        await putObject(r2, key, webp.data, { contentType: "image/webp", cacheControl: CACHE_CONTROL });
        const { error } = await supabase
          .from("links")
          .update({ web_thumbnail_key: key })
          .eq("id", link.id)
          .is("web_thumbnail_key", null);
        if (error) throw new Error(`link_update_failed: ${error.message}`);
        consecutiveWriteFailures = 0;
      } catch (error) {
        const reason = String(error?.message ?? error).slice(0, 120);
        stats.failed += 1;
        failures[reason.split(":")[0]] = (failures[reason.split(":")[0]] ?? 0) + 1;
        log("rehost_failed", { link_id: link.id, reason });
        // One bad upload is retried next run; a streak means the credentials, the
        // bucket or the database is wrong, and carrying on would only repeat it.
        consecutiveWriteFailures += 1;
        if (consecutiveWriteFailures >= 10) throw new Error(`aborting after 10 failed writes in a row; last: ${reason}`);
        return;
      }
    }
    stats.rehosted += 1;
    stats.bytesIn += source.buffer.length;
    stats.bytesOut += webp.data.length;
    const label = `${source.platform}:${source.variant}`;
    bySource[label] = (bySource[label] ?? 0) + 1;
    if (stats.rehosted % 500 === 0) log("rehost_progress", { rehosted: stats.rehosted, failed: stats.failed });
  }

  // A small worker pool over the candidate stream.
  const iterator = candidates(supabase, { publishedOnly: args.publishedOnly });
  let exhausted = false;
  async function next() {
    for (;;) {
      if (exhausted || (args.limit && stats.considered >= args.limit)) return null;
      const { value, done } = await iterator.next();
      if (done) {
        exhausted = true;
        return null;
      }
      if (seen.has(value.link.id)) continue;
      seen.add(value.link.id);
      stats.considered += 1;
      return value.link;
    }
  }
  // The generator isn't safe to step from several workers at once, so they queue.
  let pending = Promise.resolve();
  const take = () => {
    const result = pending.then(next);
    pending = result.catch(() => null);
    return result;
  };
  await Promise.all(
    Array.from({ length: args.concurrency }, async () => {
      for (;;) {
        const link = await take();
        if (!link) return;
        await processLink(link);
      }
    }),
  );

  log("rehost_finished", {
    ...stats,
    mbIn: Number((stats.bytesIn / 1048576).toFixed(1)),
    mbOut: Number((stats.bytesOut / 1048576).toFixed(1)),
    bySource,
    failures,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    dryRun: args.dryRun,
  });
}

main().catch((error) => {
  log("rehost_crashed", { message: String(error?.message ?? error).slice(0, 300) });
  process.exit(1);
});
